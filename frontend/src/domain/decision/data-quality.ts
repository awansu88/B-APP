/**
 * Data Quality Gate. PASS (normal), LIMIT (confidence may be capped / category
 * downgraded), BLOCK (final decision must be SKIP). Non-directional: it never
 * produces a side, only a processing level.
 */
import { DecisionConfig } from './config';
import { DataQualityInput, DataQualityLevel } from './types';

export function dataQualityGate(
  dq: DataQualityInput,
  config: DecisionConfig,
): DataQualityLevel {
  if (!dq.warmupMet || dq.winnerCompleteness < 1 || dq.missingRounds > 0) {
    return DataQualityLevel.BLOCK;
  }
  if (dq.revisions > 0 || dq.pairCompleteness < config.limitPairCompleteness) {
    return DataQualityLevel.LIMIT;
  }
  return DataQualityLevel.PASS;
}
