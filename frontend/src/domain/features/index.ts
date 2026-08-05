import { VERSION_REGISTRY } from '../../config/versions';

/**
 * Feature extraction (Milestone 0: contract only, no logic).
 * Features are derived numeric signals computed from raw rounds and consumed by
 * analyzers. They are always reconstructable from raw rounds (Principle #2).
 */
export const FEATURE_VERSION = VERSION_REGISTRY.feature;

export interface FeatureVector {
  readonly [featureId: string]: number;
}
