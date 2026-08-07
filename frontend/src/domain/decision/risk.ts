/**
 * Risk Filter. Computes risk flags + level and applies a conservative filter to
 * the post-data-quality category/confidence.
 *
 * The filter MAY: retain, downgrade one category, or turn a BET into a SKIP.
 * The filter MAY NEVER: reverse the side, raise a category, or increase
 * confidence after assessment.
 */
import { round6 } from '../analysis/helpers';
import { PredictionCategory, PredictionDecision } from '../models/enums';
import { DecisionConfig } from './config';
import {
  CATEGORY_CEILING,
  downgradeCategory,
} from './confidence';
import {
  DataQualityLevel,
  DecisionRecord,
  DecisionReason,
  DecisionRiskFlag,
  RiskLevel,
  VoteSide,
  VotingResult,
} from './types';

const BAND_THRESHOLDS = [0.55, 0.6, 0.7];

const nearThreshold = (c: number, eps: number): boolean =>
  BAND_THRESHOLDS.some((t) => Math.abs(c - t) <= eps);

export interface RiskFlagOptions {
  /** Include the volatility (SHADOW) signal — true only for the shadow record. */
  readonly includeVolatility: boolean;
}

/**
 * Compute the ordered, de-duplicated risk-flag set for a decision.
 * `rawConfidence` is used only for the near-threshold check.
 */
export function computeRiskFlags(
  voting: VotingResult,
  regimeTransitioning: boolean,
  recentPatternBreaks: number,
  nonTieCount: number,
  dqLevel: DataQualityLevel,
  rawConfidence: number,
  config: DecisionConfig,
  opts: RiskFlagOptions,
): DecisionRiskFlag[] {
  const flags: DecisionRiskFlag[] = [];
  if (voting.directionalModuleCount < config.lowModuleCountThreshold) {
    flags.push(DecisionRiskFlag.LOW_MODULE_COUNT);
  }
  if (voting.supportingFamilyCount <= 1) {
    flags.push(DecisionRiskFlag.SINGLE_FAMILY_SUPPORT);
  }
  if (voting.conflictScore >= config.strongOpposition) {
    flags.push(DecisionRiskFlag.STRONG_OPPOSITION);
  } else if (voting.conflictScore >= config.moderateConflict) {
    flags.push(DecisionRiskFlag.MODERATE_CONFLICT);
  }
  if (regimeTransitioning) flags.push(DecisionRiskFlag.REGIME_TRANSITION);
  if (dqLevel === DataQualityLevel.LIMIT) {
    flags.push(DecisionRiskFlag.MEDIUM_DATA_QUALITY);
  }
  if (nonTieCount < config.lowSampleThreshold) {
    flags.push(DecisionRiskFlag.LOW_SAMPLE_RELIABILITY);
  }
  if (nearThreshold(rawConfidence, config.nearThresholdEps)) {
    flags.push(DecisionRiskFlag.CONFIDENCE_NEAR_THRESHOLD);
  }
  if (opts.includeVolatility && recentPatternBreaks >= config.recentBreakThreshold) {
    flags.push(DecisionRiskFlag.RECENT_PATTERN_BREAK);
  }
  return flags;
}

/**
 * Apply the risk filter to a post-data-quality (category, confidence). Never
 * reverses the side, raises a category, or increases confidence.
 */
export function applyRiskFilter(
  postCategory: PredictionCategory,
  postConfidence: number,
  winner: VoteSide | null,
  flags: readonly DecisionRiskFlag[],
  dqLevel: DataQualityLevel,
  _config: DecisionConfig,
): DecisionRecord {
  const strongOpposition = flags.includes(DecisionRiskFlag.STRONG_OPPOSITION);
  const softFlags = flags.filter((f) => f !== DecisionRiskFlag.STRONG_OPPOSITION);
  const softCount = softFlags.length;
  const riskScore = softCount + (strongOpposition ? 3 : 0);

  const reasons: DecisionReason[] = [];
  let level: RiskLevel;
  let action: 'SKIP' | 'DOWNGRADE' | 'RETAIN';

  const alreadySkip =
    winner === null || postCategory === PredictionCategory.BELOW_THRESHOLD;

  if (dqLevel === DataQualityLevel.BLOCK) {
    level = RiskLevel.CRITICAL;
    action = 'SKIP';
  } else if (alreadySkip) {
    // Skip already forced upstream (agreement / module / evidence gate).
    action = 'SKIP';
    level = strongOpposition || softCount >= 3
      ? RiskLevel.HIGH
      : softCount === 2
        ? RiskLevel.MEDIUM
        : softCount === 1
          ? RiskLevel.LOW
          : RiskLevel.NONE;
  } else if (strongOpposition) {
    level = RiskLevel.HIGH;
    action = 'SKIP';
    reasons.push(DecisionReason.STRONG_OPPOSITION_SKIP);
  } else if (softCount >= 3) {
    level = RiskLevel.HIGH;
    action = 'SKIP';
    reasons.push(DecisionReason.MULTIPLE_RISK_SKIP);
  } else if (softCount === 2) {
    level = RiskLevel.MEDIUM;
    action = 'DOWNGRADE';
    reasons.push(DecisionReason.CATEGORY_DOWNGRADED);
  } else if (softCount === 1) {
    level = RiskLevel.LOW;
    action = 'RETAIN';
    reasons.push(DecisionReason.RISK_RETAINED);
  } else {
    level = RiskLevel.NONE;
    action = 'RETAIN';
    reasons.push(DecisionReason.NO_RISK);
  }

  const finalCategory =
    action === 'SKIP'
      ? PredictionCategory.BELOW_THRESHOLD
      : action === 'DOWNGRADE'
        ? downgradeCategory(postCategory)
        : postCategory;

  // Never increase confidence; clamp to the (possibly lower) band ceiling.
  const finalConfidence = round6(Math.min(postConfidence, CATEGORY_CEILING[finalCategory]));

  const isBet = finalCategory !== PredictionCategory.BELOW_THRESHOLD && winner !== null;
  const decision = isBet
    ? winner === VoteSide.PLAYER
      ? PredictionDecision.BET_PLAYER
      : PredictionDecision.BET_BANKER
    : PredictionDecision.SKIP;

  return {
    decision,
    side: isBet ? winner : null,
    confidence: finalConfidence,
    category: finalCategory,
    riskScore,
    riskLevel: level,
    riskFlags: Object.freeze([...flags]),
    reasonCodes: Object.freeze(reasons),
  };
}
