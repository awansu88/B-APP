/**
 * Milestone 4 — Decision Pipeline orchestrator (pure, deterministic).
 *
 * Module Results -> Data Quality Gate -> Weighted Voting -> Family Correlation
 * Cap -> Conflict Detection -> Confidence Engine -> Risk Filter -> Prediction
 * Draft, producing independent ACTIVE and SHADOW records. NO persistence, NO
 * prediction locking, NO result submission/evaluation (Milestone 5+).
 */
import { VERSION_REGISTRY } from '../../config/versions';
import { runAnalysis } from '../analysis/runner';
import type { AnalysisContext, ModuleAnalysis } from '../analysis/types';
import { TransitionState } from '../features/feature-extraction';
import { PredictionCategory } from '../models/enums';
import {
  categoryFromConfidence,
  categoryIndex,
  confidenceFromWinnerScore,
  minCategory,
} from './confidence';
import { DECISION_CONFIG, DECISION_CONFIG_VERSION, DecisionConfig } from './config';
import { dataQualityGate } from './data-quality';
import { applyRiskFilter, computeRiskFlags } from './risk';
import {
  DataQualityLevel,
  DecisionContext,
  DecisionRecord,
  DecisionReason,
  DecisionResult,
  PredictionDraft,
  VoteSide,
} from './types';
import { computeVoting } from './voting';
import { STRICT_PROFILE, type EngineProfile } from './profiles';
import { round6 } from '../analysis/helpers';

const withReasons = (
  record: DecisionRecord,
  prefix: readonly DecisionReason[],
): DecisionRecord => ({
  ...record,
  reasonCodes: Object.freeze([...prefix, ...record.reasonCodes]),
});

/**
 * Core fixed-vector entrypoint. Consumes module results + non-voting context.
 */
export function decide(
  moduleResults: readonly ModuleAnalysis[],
  context: DecisionContext,
  config: DecisionConfig = DECISION_CONFIG,
): DecisionResult {
  const voting = computeVoting(moduleResults, config);
  const dqLevel = dataQualityGate(context.dataQuality, config);

  const winnerScore =
    voting.winner === VoteSide.PLAYER
      ? voting.playerScore
      : voting.winner === VoteSide.BANKER
        ? voting.bankerScore
        : 0;

  const rawConfidence = confidenceFromWinnerScore(winnerScore, config);

  // Voting / gate reason codes shared by both records.
  const gateReasons: DecisionReason[] = [];
  let rawCategory: PredictionCategory;
  if (voting.winner === null) {
    rawCategory = PredictionCategory.BELOW_THRESHOLD;
    gateReasons.push(DecisionReason.NO_DIRECTIONAL_SIGNAL);
  } else if (voting.directionalModuleCount < config.minDirectionalModules) {
    rawCategory = PredictionCategory.BELOW_THRESHOLD;
    gateReasons.push(DecisionReason.INSUFFICIENT_DIRECTIONAL_MODULES);
  } else if (voting.weightedAgreement < config.minWeightedAgreement) {
    rawCategory = PredictionCategory.BELOW_THRESHOLD;
    gateReasons.push(DecisionReason.BELOW_MIN_AGREEMENT);
  } else {
    rawCategory = categoryFromConfidence(rawConfidence);
    gateReasons.push(
      rawCategory === PredictionCategory.BELOW_THRESHOLD
        ? DecisionReason.INSUFFICIENT_EVIDENCE
        : DecisionReason.DIRECTIONAL_CONSENSUS,
    );
  }

  // Data Quality effect on category / confidence.
  let postCategory = rawCategory;
  let postConfidence = rawConfidence;
  if (dqLevel === DataQualityLevel.BLOCK) {
    postCategory = PredictionCategory.BELOW_THRESHOLD;
    postConfidence = round6(Math.min(rawConfidence, 0.54));
    gateReasons.push(DecisionReason.DATA_QUALITY_BLOCK);
  } else if (dqLevel === DataQualityLevel.LIMIT) {
    const capped = minCategory(postCategory, PredictionCategory.QUALIFIED);
    if (categoryIndex(capped) < categoryIndex(postCategory)) {
      postConfidence = round6(Math.min(postConfidence, 0.69));
    }
    postCategory = capped;
    gateReasons.push(DecisionReason.DATA_QUALITY_LIMIT);
  } else {
    gateReasons.push(DecisionReason.DATA_QUALITY_PASS);
  }

  // Risk flags: active excludes volatility; shadow includes it.
  const activeFlags = computeRiskFlags(
    voting,
    context.regimeTransitioning,
    context.recentPatternBreaks,
    context.nonTieCount,
    dqLevel,
    rawConfidence,
    config,
    { includeVolatility: false },
  );
  const shadowFlags = computeRiskFlags(
    voting,
    context.regimeTransitioning,
    context.recentPatternBreaks,
    context.nonTieCount,
    dqLevel,
    rawConfidence,
    config,
    { includeVolatility: true },
  );

  const activeRaw = applyRiskFilter(
    postCategory,
    postConfidence,
    voting.winner,
    activeFlags,
    dqLevel,
    config,
  );
  const shadowRaw = applyRiskFilter(
    postCategory,
    postConfidence,
    voting.winner,
    shadowFlags,
    dqLevel,
    config,
  );

  // Shadow difference annotation (volatility is SHADOW_ONLY — never alters active).
  const shadowDiff: DecisionReason[] = [];
  if (shadowRaw.decision !== activeRaw.decision) {
    shadowDiff.push(DecisionReason.SHADOW_VOLATILITY_SKIP);
  } else if (categoryIndex(shadowRaw.category) < categoryIndex(activeRaw.category)) {
    shadowDiff.push(DecisionReason.SHADOW_VOLATILITY_DOWNGRADE);
  } else {
    shadowDiff.push(DecisionReason.SHADOW_MATCHES_ACTIVE);
  }

  const active = withReasons(activeRaw, gateReasons);
  const shadow = withReasons(shadowRaw, [...gateReasons, ...shadowDiff]);

  const draft: PredictionDraft = {
    isDraft: true,
    decision: active.decision,
    side: active.side,
    confidence: active.confidence,
    category: active.category,
  };

  return {
    votingVersion: VERSION_REGISTRY.voting,
    confidenceVersion: VERSION_REGISTRY.confidence,
    riskVersion: VERSION_REGISTRY.risk,
    engineVersion: VERSION_REGISTRY.engine,
    configVersion: VERSION_REGISTRY.config,
    decisionConfigVersion: DECISION_CONFIG_VERSION,
    playerScore: voting.playerScore,
    bankerScore: voting.bankerScore,
    weightedAgreement: voting.weightedAgreement,
    conflictScore: voting.conflictScore,
    familyContributions: voting.familyContributions,
    directionalModuleCount: voting.directionalModuleCount,
    supportingFamilyCount: voting.supportingFamilyCount,
    opposingFamilyCount: voting.opposingFamilyCount,
    dataQualityLevel: dqLevel,
    rawConfidence,
    rawCategory,
    active,
    shadow,
    draft,
  };
}

/**
 * High-level entrypoint over an AnalysisContext. Runs the analysis modules and
 * derives the non-voting context from the feature set (regime transition and
 * recent pattern breaks are shadow/context signals). Deterministic.
 *
 * `profile` selects a versioned analyzer-activation registry (default STRICT /
 * DECISION-001 — behaviorally identical to the accepted pipeline). The profile
 * only changes which modules are ACTIVE and the stamped decision version; it
 * never alters voting/confidence/risk mathematics.
 */
export function runDecisionPipeline(
  ctx: AnalysisContext,
  config: DecisionConfig = DECISION_CONFIG,
  profile: EngineProfile = STRICT_PROFILE,
  extraModules: readonly ModuleAnalysis[] = [],
): DecisionResult {
  const report = runAnalysis(ctx, profile.modules);
  const f = ctx.features;
  const context: DecisionContext = {
    nonTieCount: f.nonTieCount,
    regimeTransitioning: f.regime.transitionState === TransitionState.TRANSITIONING,
    recentPatternBreaks: f.volatility.recentPatternBreaks,
    dataQuality: {
      warmupMet: f.nonTieCount >= config.minNonTieHistory,
      winnerCompleteness: f.dataQuality.winnerCompleteness,
      pairCompleteness: f.dataQuality.pairCompleteness,
      revisions: f.dataQuality.revisions,
      missingRounds: f.dataQuality.missingRounds,
    },
  };
  // M7.1 Patch 3 — the Historical Matcher (HMATCH-002) is injected here as an
  // ADDITIONAL ACTIVE ModuleAnalysis (HISTORICAL family) ONLY when the caller
  // proved it passed every gate and produced a directional vote. `decide()` and
  // all voting/confidence/risk math are unchanged; default (no extras) is
  // byte-identical to the accepted pipeline.
  const results = extraModules.length > 0 ? [...report.results, ...extraModules] : report.results;
  const result = decide(results, context, config);
  // STRICT stamps DECISION-001 (identity); non-STRICT profiles stamp their own
  // versioned decision label without touching any decision mathematics.
  return result.decisionConfigVersion === profile.decisionVersion
    ? result
    : { ...result, decisionConfigVersion: profile.decisionVersion };
}
