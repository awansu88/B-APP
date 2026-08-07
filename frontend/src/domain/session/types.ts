/**
 * Milestone 5 — Live Workflow & Session Tracker types (pure domain).
 *
 * A live/historical session drives ONE manual result at a time. Predictions are
 * LOCKED before their result (Principle #5) and are deep-frozen — recommendation,
 * confidence, category, module outputs, risk flags, config version, and target
 * round can never silently change after locking.
 */
import type { DecisionReason, DecisionRiskFlag, RiskLevel, VoteSide } from '../decision';
import type { ModuleAnalysis } from '../analysis/types';
import { PredictionCategory, PredictionDecision } from '../models/enums';
import type { RevisionRecord } from '../models/records';
import type { RoundRecord } from '../models/round';
import { Winner } from '../models/outcome';
import { SessionEnvironment } from './environment';

export const SESSION_VERSION = 'SESSION-001';

/** Live workflow states. */
export enum WorkflowState {
  HISTORY_INPUT = 'HISTORY_INPUT',
  READY_TO_START = 'READY_TO_START',
  COMPUTING_PREDICTION = 'COMPUTING_PREDICTION',
  WAITING_FOR_RESULT = 'WAITING_FOR_RESULT',
  EDITING_HISTORY = 'EDITING_HISTORY',
  SHOE_CLOSED = 'SHOE_CLOSED',
  ERROR_RECOVERY = 'ERROR_RECOVERY',
}

/** Three-win tracking profiles (which categories count as a valid recommendation). */
export enum SessionProfile {
  EXPERIMENTAL_PLUS = 'EXPERIMENTAL_PLUS',
  QUALIFIED_PLUS = 'QUALIFIED_PLUS',
  HIGH_ONLY = 'HIGH_ONLY',
}

/** Whether the operator actually played a locked recommendation. */
export enum OperatorAction {
  PLAYED = 'PLAYED',
  NOT_PLAYED = 'NOT_PLAYED',
}

/** Evaluation of a single locked prediction against its actual result. */
export enum StepResult {
  PENDING = 'PENDING',
  WIN = 'WIN',
  LOSS = 'LOSS',
  PUSH = 'PUSH',
  SKIPPED = 'SKIPPED',
  INVALIDATED = 'INVALIDATED',
}

/** Categories eligible per profile. */
export const PROFILE_CATEGORIES: Readonly<Record<SessionProfile, readonly PredictionCategory[]>> =
  Object.freeze({
    [SessionProfile.EXPERIMENTAL_PLUS]: [
      PredictionCategory.EXPERIMENTAL,
      PredictionCategory.QUALIFIED,
      PredictionCategory.HIGH_RECOMMENDATION,
    ],
    [SessionProfile.QUALIFIED_PLUS]: [
      PredictionCategory.QUALIFIED,
      PredictionCategory.HIGH_RECOMMENDATION,
    ],
    [SessionProfile.HIGH_ONLY]: [PredictionCategory.HIGH_RECOMMENDATION],
  });

export const ALL_PROFILES: readonly SessionProfile[] = Object.freeze([
  SessionProfile.EXPERIMENTAL_PLUS,
  SessionProfile.QUALIFIED_PLUS,
  SessionProfile.HIGH_ONLY,
]);

/**
 * SHADOW audit snapshot (SHADOW_ONLY analyzers: volatility + derived-road).
 *
 * Captured ALONGSIDE the active decision purely for later auditability. Shadow
 * information NEVER influences the active side / confidence / category / BET-SKIP
 * / sequence result — it is a read-only "what a volatility-aware evaluation would
 * have said" record. `differsFromActive` is a convenience flag for reviewers.
 */
export interface ShadowAudit {
  readonly decision: PredictionDecision;
  readonly side: VoteSide | null;
  readonly confidence: number;
  readonly category: PredictionCategory;
  readonly riskScore: number;
  readonly riskLevel: RiskLevel;
  readonly riskFlags: readonly DecisionRiskFlag[];
  readonly reasonCodes: readonly DecisionReason[];
  readonly differsFromActive: boolean;
}

/** An immutable, locked prediction captured BEFORE its result is known. */
export interface LockedPrediction {
  readonly id: string;
  readonly shoeId: string;
  readonly targetRound: number;
  readonly environment: SessionEnvironment;
  readonly decision: PredictionDecision;
  readonly side: VoteSide | null;
  readonly confidence: number;
  readonly category: PredictionCategory;
  readonly moduleResults: readonly ModuleAnalysis[];
  readonly riskFlags: readonly DecisionRiskFlag[];
  /** ACTIVE decision-trace completeness (never affected by shadow inputs). */
  readonly riskScore: number;
  readonly riskLevel: RiskLevel;
  readonly reasonCodes: readonly DecisionReason[];
  /** SHADOW audit record (auditable only; never influences the active fields). */
  readonly shadow: ShadowAudit;
  readonly playerScore: number;
  readonly bankerScore: number;
  readonly weightedAgreement: number;
  readonly conflictScore: number;
  readonly votingVersion: string;
  readonly confidenceVersion: string;
  readonly riskVersion: string;
  readonly engineVersion: string;
  readonly configVersion: string;
  readonly decisionConfigVersion: string;
  readonly snapshotVersion: string;
  readonly featureVersion: string;
  readonly lockedAt: string;
  readonly locked: true;
}

/** A prediction plus its (eventual) evaluation — the audit trail entry. */
export interface PredictionEntry {
  readonly prediction: LockedPrediction;
  readonly result: StepResult;
  readonly actualWinner: Winner | null;
  readonly operatorAction: OperatorAction | null;
  readonly invalidated: boolean;
}

/** Running state of a single three-win tracker. */
export interface SequenceState {
  readonly consecutiveWins: number;
  readonly achieved: boolean;
  readonly completions: number;
}

export type ProfileSequenceMap = Readonly<Record<SessionProfile, SequenceState>>;

/** Engine sequence (all recommendations) vs Played sequence (operator-played only). */
export interface SessionSequences {
  readonly engine: ProfileSequenceMap;
  readonly played: ProfileSequenceMap;
}

/** Fixed-unit paper P/L (PLAYED steps only). No martingale / progression. */
export interface PaperTracking {
  readonly unitsStaked: number;
  readonly netUnits: number;
  readonly wins: number;
  readonly losses: number;
  readonly pushes: number;
}

/** Full deterministic session state. */
export interface SessionState {
  readonly version: string;
  readonly workflow: WorkflowState;
  readonly environment: SessionEnvironment;
  readonly shoeId: string;
  readonly rounds: readonly RoundRecord[];
  readonly currentPrediction: LockedPrediction | null;
  readonly predictions: readonly PredictionEntry[];
  readonly sequences: SessionSequences;
  readonly revisions: readonly RevisionRecord[];
  readonly paper: PaperTracking;
  readonly error: string | null;
}

/** Serializable persisted form (for restart reconstruction). */
export interface PersistedSession {
  readonly version: string;
  readonly workflow: WorkflowState;
  readonly environment: SessionEnvironment;
  readonly shoeId: string;
  readonly rounds: readonly RoundRecord[];
  readonly predictions: readonly PredictionEntry[];
  readonly revisions: readonly RevisionRecord[];
}

export class InsufficientHistoryError extends Error {
  constructor(public readonly nonTieCount: number) {
    super(`Need at least 8 non-Tie results to start (have ${nonTieCount}).`);
    this.name = 'InsufficientHistoryError';
  }
}
export class DuplicateResultError extends Error {
  constructor(public readonly workflow: string) {
    super(`Result input is disabled in workflow state ${workflow}.`);
    this.name = 'DuplicateResultError';
  }
}
export class TargetRoundError extends Error {
  constructor(public readonly expected: number, public readonly got: number) {
    super(`Expected target round ${expected}, got ${got}.`);
    this.name = 'TargetRoundError';
  }
}
