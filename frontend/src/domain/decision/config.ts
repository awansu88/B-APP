/**
 * Milestone 4 — Decision Pipeline baseline configuration (LOCKED, DECISION-001).
 *
 * These are conservative, UNCALIBRATED MVP constants. Any change is a versioned
 * engine decision (bump DECISION_CONFIG_VERSION). No current-shoe tuning.
 */
export const DECISION_CONFIG_VERSION = 'DECISION-001';

export interface DecisionConfig {
  /** Minimum non-Tie history before any recommendation (warm-up). */
  readonly minNonTieHistory: number;
  /** Minimum directional modules required for an Experimental recommendation. */
  readonly minDirectionalModules: number;
  /** Minimum weighted agreement to allow a BET (else SKIP). */
  readonly minWeightedAgreement: number;
  /** Within-family correlation discount (caps correlated evidence). */
  readonly correlationDiscount: number;
  /** Context (regime) family multiplier — regime modifies context, not raw evidence. */
  readonly contextFamilyWeight: number;
  /** Confidence band floor (Experimental). */
  readonly experimentalFloor: number;
  /** Confidence span mapped by evidence depth (floor + span·term). */
  readonly confidenceSpan: number;
  /** Winner-score at which evidence term is 0 (band floor). */
  readonly evidenceMin: number;
  /** Winner-score at which evidence term saturates to 1 (max confidence). */
  readonly evidenceFull: number;
  /** Hard maximum uncalibrated confidence. */
  readonly maxConfidence: number;
  /** directionalModules below this raises LOW_MODULE_COUNT. */
  readonly lowModuleCountThreshold: number;
  /** non-Tie below this raises LOW_SAMPLE_RELIABILITY. */
  readonly lowSampleThreshold: number;
  /** conflict >= this (and < strongOpposition) raises MODERATE_CONFLICT. */
  readonly moderateConflict: number;
  /** conflict >= this raises STRONG_OPPOSITION (hard SKIP). */
  readonly strongOpposition: number;
  /** recentPatternBreaks >= this raises RECENT_PATTERN_BREAK (shadow only). */
  readonly recentBreakThreshold: number;
  /** distance to a band boundary within this raises CONFIDENCE_NEAR_THRESHOLD. */
  readonly nearThresholdEps: number;
  /** pairCompleteness below this makes data quality LIMIT. */
  readonly limitPairCompleteness: number;
}

export const DECISION_CONFIG: DecisionConfig = Object.freeze({
  minNonTieHistory: 8,
  minDirectionalModules: 2,
  minWeightedAgreement: 0.58,
  correlationDiscount: 0.5,
  contextFamilyWeight: 0.5,
  experimentalFloor: 0.55,
  confidenceSpan: 0.2,
  evidenceMin: 0.3,
  evidenceFull: 1.5,
  maxConfidence: 0.75,
  lowModuleCountThreshold: 3,
  lowSampleThreshold: 12,
  moderateConflict: 0.25,
  strongOpposition: 0.4,
  recentBreakThreshold: 2,
  nearThresholdEps: 0.01,
  limitPairCompleteness: 0.5,
});
