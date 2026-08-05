import {
  CONFIDENCE_BANDS,
  MAX_UNCALIBRATED_CONFIDENCE,
} from '../../config/engine';

/**
 * Confidence categories.
 *  - BELOW_THRESHOLD:     < 55%  (never recommended)
 *  - EXPERIMENTAL:        55%–59%
 *  - QUALIFIED:           60%–69%
 *  - HIGH_RECOMMENDATION: 70%–75%
 */
export enum ConfidenceCategory {
  BELOW_THRESHOLD = 'BELOW_THRESHOLD',
  EXPERIMENTAL = 'EXPERIMENTAL',
  QUALIFIED = 'QUALIFIED',
  HIGH_RECOMMENDATION = 'HIGH_RECOMMENDATION',
}

/**
 * Categorize a raw confidence (fraction of 1). The value is first clamped to
 * the maximum uncalibrated confidence (0.75) — the engine never claims more.
 */
export function categorizeConfidence(confidence: number): ConfidenceCategory {
  const clamped = Math.min(
    Math.max(confidence, 0),
    MAX_UNCALIBRATED_CONFIDENCE,
  );
  if (clamped < CONFIDENCE_BANDS.experimental.min) {
    return ConfidenceCategory.BELOW_THRESHOLD;
  }
  if (clamped < CONFIDENCE_BANDS.experimental.maxExclusive) {
    return ConfidenceCategory.EXPERIMENTAL;
  }
  if (clamped < CONFIDENCE_BANDS.qualified.maxExclusive) {
    return ConfidenceCategory.QUALIFIED;
  }
  return ConfidenceCategory.HIGH_RECOMMENDATION;
}
