/**
 * Milestone 1 domain enumerations. All domain values are strongly typed enums —
 * no untyped string literals are used for domain concepts.
 */
import { PredictionDecision } from '../prediction/decision';
import { SessionEnvironment } from '../session/environment';

/** Where a raw round originated. */
export enum RoundSource {
  HISTORY = 'HISTORY',
  LIVE = 'LIVE',
  HISTORICAL_TEST = 'HISTORICAL_TEST',
}

/** Lifecycle status of a shoe. */
export enum ShoeStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
}

/**
 * Recommendation confidence tier.
 *  - BELOW_THRESHOLD:     < 55% (never recommended)
 *  - EXPERIMENTAL:        55%-59%
 *  - QUALIFIED:           60%-69%
 *  - HIGH_RECOMMENDATION: 70%-75%
 */
export enum PredictionCategory {
  BELOW_THRESHOLD = 'BELOW_THRESHOLD',
  EXPERIMENTAL = 'EXPERIMENTAL',
  QUALIFIED = 'QUALIFIED',
  HIGH_RECOMMENDATION = 'HIGH_RECOMMENDATION',
}

/** Lifecycle status of a prediction (locked before its result is submitted). */
export enum PredictionStatus {
  LOCKED = 'LOCKED',
  EVALUATED = 'EVALUATED',
  VOID = 'VOID',
}

/** Result of evaluating a locked prediction against the actual round. */
export enum EvaluationStatus {
  PENDING = 'PENDING',
  WIN = 'WIN',
  LOSS = 'LOSS',
  PUSH = 'PUSH',
  SKIP = 'SKIP',
}

/** Directional signal emitted by an analysis module. */
export enum ModuleSignal {
  PLAYER = 'PLAYER',
  BANKER = 'BANKER',
  NONE = 'NONE',
}

/** Operating mode of an analysis module. */
export enum ModuleStatus {
  ACTIVE = 'ACTIVE',
  SHADOW_ONLY = 'SHADOW_ONLY',
  EXPERIMENTAL_ONLY = 'EXPERIMENTAL_ONLY',
  DISABLED = 'DISABLED',
}

// Re-export the pre-existing enums that already lived elsewhere so that all
// domain enums are discoverable from this single module. (Winner and PairState
// are exported from './outcome' and './pair' and surfaced via models/index.)
export { SessionEnvironment, PredictionDecision };
