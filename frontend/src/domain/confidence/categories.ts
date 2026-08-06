import { PredictionCategory } from '../models/enums';

// `ConfidenceCategory` is the Milestone 0 name; `PredictionCategory` is the
// canonical Milestone 1 enum. They are the same type (single source of truth).
export { PredictionCategory as ConfidenceCategory };

/**
 * MILESTONE 0/1 PLACEHOLDER — NOT IMPLEMENTED and NOT wired to any screen.
 *
 * Confidence calibration/categorisation is future-milestone work (prediction
 * modules are explicitly out of scope for Milestone 1). Kept as an explicit
 * non-runtime placeholder; it throws if ever executed.
 */
export function categorizeConfidence(_confidence: number): PredictionCategory {
  throw new Error(
    'categorizeConfidence is not implemented in Milestone 0 (bootstrap).',
  );
}
