import {
  EvaluationStatus,
  ModuleSignal,
  ModuleStatus,
  PredictionCategory,
  PredictionStatus,
  RoundSource,
  SessionEnvironment,
  ShoeStatus,
} from './enums';
import { PredictionDecision } from '../prediction/decision';

/** A shoe (a single dealing shoe of baccarat rounds). */
export interface ShoeRecord {
  readonly id: string;
  readonly label: string | null;
  readonly environment: SessionEnvironment;
  readonly status: ShoeStatus;
  readonly roundCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * A derived snapshot of a shoe at a given round. Snapshots are reconstructable
 * projections (never a source of truth); `payload` is a serialized roadmap.
 */
export interface SnapshotRecord {
  readonly id: string;
  readonly shoeId: string;
  readonly roundNumber: number;
  readonly roadmapVersion: string;
  readonly payload: string;
  readonly createdAt: string;
}

/**
 * A prediction. It is LOCKED before its actual result is submitted
 * (Principle #5) and carries the immutable engine/config versions of its batch
 * (Principle #4).
 */
export interface PredictionRecord {
  readonly id: string;
  readonly shoeId: string;
  readonly targetRoundNumber: number;
  readonly environment: SessionEnvironment;
  readonly decision: PredictionDecision;
  readonly category: PredictionCategory;
  readonly confidence: number;
  readonly status: PredictionStatus;
  readonly evaluation: EvaluationStatus;
  readonly engineVersion: string;
  readonly configVersion: string;
  readonly lockedAt: string;
  readonly evaluatedAt: string | null;
}

/** The result contributed by a single analysis module to a prediction. */
export interface ModuleResult {
  readonly id: string;
  readonly predictionId: string;
  readonly moduleId: string;
  readonly signal: ModuleSignal;
  readonly status: ModuleStatus;
  readonly weight: number;
  readonly detail: string | null;
  readonly createdAt: string;
}

/** The running state of a three-win sequence within a shoe. */
export interface SequenceRecord {
  readonly id: string;
  readonly shoeId: string;
  readonly startRoundNumber: number | null;
  readonly consecutiveWins: number;
  readonly achieved: boolean;
  readonly failed: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The action captured by a revision entry. */
export type RevisionAction = 'INSERT' | 'UPDATE' | 'DELETE';

/**
 * An audit entry recording an edit to raw rounds. Revisions make every edit
 * traceable so a shoe can be deterministically rebuilt from raw rounds.
 */
export interface RevisionRecord {
  readonly id: string;
  readonly shoeId: string;
  readonly roundNumber: number | null;
  readonly action: RevisionAction;
  readonly before: string | null;
  readonly after: string | null;
  readonly createdAt: string;
}

/** Row shape of the `source` column values used by rounds. */
export type RoundSourceValue = RoundSource;

/** A versioned, immutable engine configuration. */
export interface EngineConfig {
  readonly id: string;
  readonly configVersion: string;
  readonly engineVersion: string;
  readonly roadmapVersion: string;
  readonly featureVersion: string;
  readonly votingVersion: string;
  readonly confidenceVersion: string;
  readonly riskVersion: string;
  /** JSON-serialized locked thresholds. */
  readonly thresholds: string;
  readonly immutable: boolean;
  readonly createdAt: string;
}
