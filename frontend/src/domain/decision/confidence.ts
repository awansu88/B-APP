/**
 * Confidence Engine. Confidence is driven by EVIDENCE DEPTH (winner score),
 * NOT by the agreement ratio (agreement is only a gate + conflict input). Raw
 * confidence is clamped to [0, maxConfidence] and mapped to the locked bands.
 */
import { round6 } from '../analysis/helpers';
import { PredictionCategory } from '../models/enums';
import { DecisionConfig } from './config';

/** Ordered categories from lowest to highest. */
export const CATEGORY_ORDER: readonly PredictionCategory[] = Object.freeze([
  PredictionCategory.BELOW_THRESHOLD,
  PredictionCategory.EXPERIMENTAL,
  PredictionCategory.QUALIFIED,
  PredictionCategory.HIGH_RECOMMENDATION,
]);

/** Highest confidence permitted for each category (never increases on downgrade). */
export const CATEGORY_CEILING: Readonly<Record<PredictionCategory, number>> = Object.freeze({
  [PredictionCategory.BELOW_THRESHOLD]: 0.54,
  [PredictionCategory.EXPERIMENTAL]: 0.59,
  [PredictionCategory.QUALIFIED]: 0.69,
  [PredictionCategory.HIGH_RECOMMENDATION]: 0.75,
});

export const categoryIndex = (c: PredictionCategory): number => CATEGORY_ORDER.indexOf(c);

export const downgradeCategory = (c: PredictionCategory): PredictionCategory =>
  CATEGORY_ORDER[Math.max(0, categoryIndex(c) - 1)];

export const minCategory = (
  a: PredictionCategory,
  b: PredictionCategory,
): PredictionCategory => (categoryIndex(a) <= categoryIndex(b) ? a : b);

/** Map a raw winner score to an uncalibrated confidence (evidence-depth based). */
export function confidenceFromWinnerScore(
  winnerScore: number,
  config: DecisionConfig,
): number {
  const evidenceTerm =
    (winnerScore - config.evidenceMin) / (config.evidenceFull - config.evidenceMin);
  const raw = config.experimentalFloor + config.confidenceSpan * evidenceTerm;
  return round6(Math.max(0, Math.min(config.maxConfidence, raw)));
}

/**
 * Categorise a confidence value using the locked bands. The BET/SKIP FLOOR
 * (default 0.55) may be lowered to a versioned BALCFG-001 preset (0.54/0.53/
 * 0.52) for the BALANCED DECISION-004 snapshot; the higher QUALIFIED (0.60) and
 * HIGH (0.70) bands are NEVER changed.
 */
export function categoryFromConfidence(
  c: number,
  betThreshold: number = 0.55,
): PredictionCategory {
  if (c < betThreshold) return PredictionCategory.BELOW_THRESHOLD;
  if (c < 0.6) return PredictionCategory.EXPERIMENTAL;
  if (c < 0.7) return PredictionCategory.QUALIFIED;
  return PredictionCategory.HIGH_RECOMMENDATION;
}
