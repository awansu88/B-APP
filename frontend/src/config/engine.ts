/**
 * B-APP Baccarat Engine — LOCKED engine thresholds (Milestone 0).
 *
 * These thresholds define the calibrated behaviour of the engine and MUST NOT
 * be changed silently. Any change is a versioned engine decision (see
 * docs/ENGINE_RULES.md and AGENTS.md).
 */

/** Minimum warm-up: 8 non-Tie results before predictions are allowed. */
export const MIN_WARMUP_NON_TIE = 8;

/** Maximum uncalibrated confidence the engine may ever emit. */
export const MAX_UNCALIBRATED_CONFIDENCE = 0.75;

/** Three consecutive valid recommendation wins define a completed target. */
export const THREE_WIN_TARGET = 3;

/**
 * Confidence category bands (fractions of 1).
 *  - Experimental:        55%–59%  -> [0.55, 0.60)
 *  - Qualified:           60%–69%  -> [0.60, 0.70)
 *  - High Recommendation: 70%–75%  -> [0.70, 0.75]
 * Confidence below 0.55 is BELOW_THRESHOLD. Nothing exceeds 0.75.
 */
export const CONFIDENCE_BANDS = Object.freeze({
  experimental: Object.freeze({ min: 0.55, maxExclusive: 0.6 }),
  qualified: Object.freeze({ min: 0.6, maxExclusive: 0.7 }),
  highRecommendation: Object.freeze({ min: 0.7, maxInclusive: 0.75 }),
} as const);
