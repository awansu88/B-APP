/**
 * Milestone 5 — session engine primitives: prediction locking, evaluation, and
 * the three-win tracker. Pure and deterministic (all time/ids injected).
 */
import { deepFreeze } from '../analysis/helpers';
import { runAnalysis } from '../analysis';
import {
  runDecisionPipeline,
  DECISION_CONFIG,
  engineProfile,
  BALANCED_PROFILE,
  BALANCED_CONFIG_VERSION,
  DECISION_004_VERSION,
  decisionConfigForBalanced,
  type BalancedDecisionConfig,
  type DecisionResult,
  type EngineProfileId,
} from '../decision';
import { TransitionState } from '../features/feature-extraction';
import { buildShoeStateSnapshot } from '../snapshot';
import { extractFeatures } from '../features';
import { PredictionDecision } from '../models/enums';
import type { RoundRecord } from '../models/round';
import { Winner } from '../models/outcome';
import { SessionEnvironment } from './environment';
import {
  evaluateMatcher,
  matcherModuleAnalysis,
  type MatcherAudit,
  type MatcherCorpus,
} from '../matcher';
import type { ModuleAnalysis } from '../analysis/types';
import {
  ALL_PROFILES,
  LockedPrediction,
  PROFILE_CATEGORIES,
  PROFILE_COMPARISON_VERSION,
  ProfileComparison,
  ProfileDecisionSnapshot,
  ProfileSequenceMap,
  SequenceState,
  SessionProfile,
  StepResult,
} from './types';
import type { PredictionCategory } from '../models/enums';

/**
 * Canonical lock: deep-freezes a prediction object graph so that BOTH freshly
 * computed locks (`computePrediction`) and reconstructed locks
 * (`reconstructSession`) share exactly one immutability implementation and can
 * never diverge. Freezes nested module results, risk-flag/reason arrays, and the
 * shadow audit record.
 */
export const lockPrediction = (prediction: LockedPrediction): LockedPrediction =>
  deepFreeze(prediction);

export interface ComputeOptions {
  readonly now?: string;
  readonly historyConfirmed?: boolean;
  /** M7.1 Patch 2 — selected engine profile for the OFFICIAL lock. Default STRICT. */
  readonly profile?: EngineProfileId;
  /**
   * M7.1 Patch 3 — prepared PRE-RESULT Historical Matcher corpus. When provided
   * AND the selected profile is BALANCED (DECISION-003), the matcher is
   * evaluated and, ONLY if it produces a directional vote through every gate,
   * injected as one ACTIVE HISTORICAL module into the (unchanged) decision.
   */
  readonly matcherCorpus?: MatcherCorpus;
  /**
   * M7.1 Patch 4 — the shoe's immutable Balanced Threshold-Lab config
   * (BALCFG-001). When provided, the BALANCED snapshot is computed as
   * DECISION-004 with this threshold as its BET/SKIP floor (regardless of the
   * selected official profile). When absent, BALANCED stays DECISION-003 @ 0.55
   * (legacy / backward-compatible).
   */
  readonly balancedConfig?: BalancedDecisionConfig;
}

/** Build an immutable pre-result profile-decision snapshot from a pipeline result. */
const toProfileSnapshot = (
  profileId: EngineProfileId,
  decision: DecisionResult,
): ProfileDecisionSnapshot => ({
  profileId,
  decisionVersion: decision.decisionConfigVersion,
  decision: decision.active.decision,
  side: decision.active.side,
  confidence: decision.active.confidence,
  category: decision.active.category,
  reasonCodes: decision.active.reasonCodes,
  riskFlags: decision.active.riskFlags,
  playerScore: decision.playerScore,
  bankerScore: decision.bankerScore,
  weightedAgreement: decision.weightedAgreement,
  conflictScore: decision.conflictScore,
});

/**
 * Build a LOCKED prediction for the NEXT target round from the completed rounds.
 * Only completed rounds are used, so no future result can enter the snapshot.
 */
export function computePrediction(
  rounds: readonly RoundRecord[],
  environment: SessionEnvironment,
  shoeId: string,
  opts: ComputeOptions = {},
): LockedPrediction {
  const historyConfirmed = opts.historyConfirmed ?? false;
  const now = opts.now ?? new Date().toISOString();
  const targetRound = rounds.length + 1;

  const snapshot = buildShoeStateSnapshot(rounds, { historyConfirmed });
  const features = extractFeatures(rounds, { historyConfirmed });
  const ctx = { snapshot, features };

  // M7.1 Patch 2/3 — compute BOTH current profiles deterministically from the
  // SAME immutable PRE-RESULT snapshot, INDEPENDENT of which profile is
  // selected. The SELECTED profile is official/actionable; the other is
  // CONTROL/COMPARISON telemetry only. Future-leakage protection is inherited
  // from the completed-rounds-only snapshot.
  const selectedId: EngineProfileId = opts.profile ?? 'STRICT';

  // M7.1 Patch 3 — the Historical Matcher (HMATCH-002) is evaluated ONCE from
  // the immutable pre-target state whenever a corpus is supplied, and belongs to
  // the BALANCED / DECISION-003 profile ALWAYS (whether BALANCED is official or
  // comparison). It is NEVER injected into STRICT / DECISION-001. On ABSTAIN no
  // module is injected, so it can never touch module-count / support gates. The
  // audit is immutable and pre-result (COLLECTING / ineligible / abstain /
  // directional) and is stored for the BALANCED snapshot regardless of selection.
  let matcherAudit: MatcherAudit | undefined;
  let matcherModules: readonly ModuleAnalysis[] = [];
  if (opts.matcherCorpus) {
    matcherAudit = evaluateMatcher(rounds, opts.matcherCorpus);
    const mod = matcherModuleAnalysis(matcherAudit);
    if (mod) matcherModules = [mod];
  }

  // STRICT is always matcher-free; BALANCED always carries the matcher module
  // (when directional). Both are computed identically regardless of selection.
  // M7.1 Patch 4 — when a per-shoe BALCFG-001 config is supplied, the BALANCED
  // snapshot is DECISION-004 with the shoe's threshold as its BET/SKIP floor
  // (ALWAYS, even when STRICT is official). Absent => DECISION-003 @ 0.55.
  const balancedConfig = opts.balancedConfig;
  const balancedProfile = balancedConfig
    ? { ...BALANCED_PROFILE, decisionVersion: DECISION_004_VERSION }
    : engineProfile('BALANCED');
  const balancedDecisionConfigObj = balancedConfig
    ? decisionConfigForBalanced(balancedConfig)
    : DECISION_CONFIG;

  const strictDecision = runDecisionPipeline(ctx, DECISION_CONFIG, engineProfile('STRICT'));
  const balancedDecision = runDecisionPipeline(
    ctx,
    balancedDecisionConfigObj,
    balancedProfile,
    matcherModules,
  );

  const decision = selectedId === 'STRICT' ? strictDecision : balancedDecision;

  // moduleResults reflect the OFFICIAL selected profile (STRICT is matcher-free;
  // the matcher module appears only when BALANCED is the official profile).
  const selectedReport = runAnalysis(ctx, engineProfile(selectedId).modules);
  const moduleResults =
    selectedId === 'BALANCED' && matcherModules.length > 0
      ? [...selectedReport.results, ...matcherModules]
      : selectedReport.results;

  const profileComparison: ProfileComparison = {
    version: PROFILE_COMPARISON_VERSION,
    selectedProfile: selectedId,
    strict: toProfileSnapshot('STRICT', strictDecision),
    balanced: toProfileSnapshot('BALANCED', balancedDecision),
  };

  return lockPrediction({
    id: `pred-${shoeId}-r${targetRound}-${now}`,
    shoeId,
    targetRound,
    environment,
    decision: decision.active.decision,
    side: decision.active.side,
    confidence: decision.active.confidence,
    category: decision.active.category,
    moduleResults,
    riskFlags: decision.active.riskFlags,
    riskScore: decision.active.riskScore,
    riskLevel: decision.active.riskLevel,
    reasonCodes: decision.active.reasonCodes,
    shadow: {
      decision: decision.shadow.decision,
      side: decision.shadow.side,
      confidence: decision.shadow.confidence,
      category: decision.shadow.category,
      riskScore: decision.shadow.riskScore,
      riskLevel: decision.shadow.riskLevel,
      riskFlags: decision.shadow.riskFlags,
      reasonCodes: decision.shadow.reasonCodes,
      differsFromActive:
        decision.shadow.decision !== decision.active.decision ||
        decision.shadow.category !== decision.active.category ||
        decision.shadow.confidence !== decision.active.confidence,
    },
    playerScore: decision.playerScore,
    bankerScore: decision.bankerScore,
    weightedAgreement: decision.weightedAgreement,
    conflictScore: decision.conflictScore,
    votingVersion: decision.votingVersion,
    confidenceVersion: decision.confidenceVersion,
    riskVersion: decision.riskVersion,
    engineVersion: decision.engineVersion,
    configVersion: decision.configVersion,
    decisionConfigVersion: decision.decisionConfigVersion,
    snapshotVersion: snapshot.snapshotVersion,
    featureVersion: features.featureVersion,
    lockedAt: now,
    locked: true,
    profileComparison,
    ...(matcherAudit ? { matcherAudit } : {}),
    ...(balancedConfig
      ? { balancedConfigVersion: BALANCED_CONFIG_VERSION, balancedThreshold: balancedConfig.threshold }
      : {}),
  });
}

// Referenced only to assert the regime signal source stays stable.
void TransitionState;

/** Evaluate a locked prediction against the actual round outcome. */
export function evaluatePrediction(
  prediction: LockedPrediction,
  actual: Winner,
  opts: { revisionAffected?: boolean } = {},
): StepResult {
  if (opts.revisionAffected) return StepResult.INVALIDATED;
  if (prediction.decision === PredictionDecision.SKIP) return StepResult.SKIPPED;
  if (actual === Winner.TIE) return StepResult.PUSH;
  if (prediction.decision === PredictionDecision.BET_PLAYER) {
    return actual === Winner.PLAYER ? StepResult.WIN : StepResult.LOSS;
  }
  if (prediction.decision === PredictionDecision.BET_BANKER) {
    return actual === Winner.BANKER ? StepResult.WIN : StepResult.LOSS;
  }
  return StepResult.SKIPPED;
}

// --- three-win tracker -----------------------------------------------------

export const initialSequence = (): SequenceState => ({
  consecutiveWins: 0,
  achieved: false,
  completions: 0,
});

export const initialProfileSequences = (): ProfileSequenceMap =>
  ({
    [SessionProfile.EXPERIMENTAL_PLUS]: initialSequence(),
    [SessionProfile.QUALIFIED_PLUS]: initialSequence(),
    [SessionProfile.HIGH_ONLY]: initialSequence(),
  });

/**
 * Advance one profile's three-win tracker.
 * - Only in-profile categories with a WIN/LOSS count.
 * - WIN advances (3 in a row completes and resets the streak).
 * - LOSS resets the streak. SKIPPED / PUSH / INVALIDATED / out-of-profile: no-op.
 */
export function advanceSequence(
  state: SequenceState,
  result: StepResult,
  category: PredictionCategory,
  profile: SessionProfile,
): SequenceState {
  const counts = PROFILE_CATEGORIES[profile].includes(category);
  if (!counts) return state;
  if (result === StepResult.WIN) {
    const cw = state.consecutiveWins + 1;
    if (cw >= 3) {
      return { consecutiveWins: 0, achieved: true, completions: state.completions + 1 };
    }
    return { ...state, consecutiveWins: cw };
  }
  if (result === StepResult.LOSS) {
    return { ...state, consecutiveWins: 0 };
  }
  return state;
}

export function advanceProfileMap(
  map: ProfileSequenceMap,
  result: StepResult,
  category: PredictionCategory,
): ProfileSequenceMap {
  const next = { ...map } as Record<SessionProfile, SequenceState>;
  for (const p of ALL_PROFILES) {
    next[p] = advanceSequence(map[p], result, category, p);
  }
  return next;
}
