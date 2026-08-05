/**
 * Confidence categories (TYPE ONLY in Milestone 0).
 *  - BELOW_THRESHOLD:     < 55%
 *  - EXPERIMENTAL:        55%–59%
 *  - QUALIFIED:           60%–69%
 *  - HIGH_RECOMMENDATION: 70%–75%
 * The numeric bands are locked constants in `src/config/engine.ts`.
 */
export enum ConfidenceCategory {
  BELOW_THRESHOLD = 'BELOW_THRESHOLD',
  EXPERIMENTAL = 'EXPERIMENTAL',
  QUALIFIED = 'QUALIFIED',
  HIGH_RECOMMENDATION = 'HIGH_RECOMMENDATION',
}

/**
 * MILESTONE 0 PLACEHOLDER — NOT IMPLEMENTED and NOT wired to any screen.
 *
 * Confidence calibration/categorisation is future-milestone work. Kept as an
 * explicit non-runtime placeholder; it throws if ever executed.
 */
export function categorizeConfidence(_confidence: number): ConfidenceCategory {
  throw new Error(
    'categorizeConfidence is not implemented in Milestone 0 (bootstrap).',
  );
}
