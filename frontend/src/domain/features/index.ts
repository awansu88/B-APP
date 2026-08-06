/**
 * Feature extraction barrel.
 *
 * Features are derived, deterministic signals computed purely from raw rounds
 * (+ roadmap) and consumed by analyzers. They are always reconstructable from
 * raw rounds (Principle #2). `FEATURE_VERSION` and the full feature set live in
 * `./feature-extraction`.
 */

/** A flat numeric feature map (Milestone 0 contract, still used for interop). */
export interface FeatureVector {
  readonly [featureId: string]: number;
}

// Milestone 3: deterministic feature extraction (windows + feature groups) and
// the single source of `FEATURE_VERSION`.
export * from './feature-extraction';
