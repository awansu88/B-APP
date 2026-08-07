/**
 * Milestone 5 — live/historical session reducer (pure, deterministic).
 *
 * Manual, one-result-at-a-time workflow shared by LIVE_FORWARD and
 * HISTORICAL_TEST (no automated replay). Every transition is computed in full
 * and returned as a NEW immutable state (transactional: a thrown guard leaves
 * the caller's previous state untouched). No DB writes here — persistence is a
 * thin adapter over `serializeSession` / `reconstructSession`.
 */
import { editRound as editRoundPure } from '../history';
import type { RoundEdit } from '../history';
import { PairState } from '../models/pair';
import { RoundSource } from '../models/enums';
import type { RoundRecord } from '../models/round';
import { Winner } from '../models/outcome';
import { SessionEnvironment } from './environment';
import {
  advanceProfileMap,
  computePrediction,
  evaluatePrediction,
  initialProfileSequences,
  type ComputeOptions,
} from './engine';
import {
  DuplicateResultError,
  InsufficientHistoryError,
  LockedPrediction,
  OperatorAction,
  PaperTracking,
  PersistedSession,
  PredictionEntry,
  SESSION_VERSION,
  SessionSequences,
  SessionState,
  StepResult,
  TargetRoundError,
  WorkflowState,
} from './types';

const nonTieCount = (rounds: readonly RoundRecord[]): number =>
  rounds.filter((r) => r.winner !== Winner.TIE).length;

const sourceFor = (env: SessionEnvironment): RoundSource =>
  env === SessionEnvironment.LIVE_FORWARD
    ? RoundSource.LIVE
    : env === SessionEnvironment.HISTORICAL_TEST
      ? RoundSource.HISTORICAL_TEST
      : RoundSource.HISTORY;

const emptyPaper = (): PaperTracking => ({
  unitsStaked: 0,
  netUnits: 0,
  wins: 0,
  losses: 0,
  pushes: 0,
});

const initialSequences = (): SessionSequences => ({
  engine: initialProfileSequences(),
  played: initialProfileSequences(),
});

const pending = (prediction: LockedPrediction): PredictionEntry => ({
  prediction,
  result: StepResult.PENDING,
  actualWinner: null,
  operatorAction: null,
  invalidated: false,
});

/** Fixed-unit paper accounting for a single PLAYED, resolved step. */
function applyPaper(paper: PaperTracking, result: StepResult): PaperTracking {
  switch (result) {
    case StepResult.WIN:
      return { ...paper, unitsStaked: paper.unitsStaked + 1, netUnits: paper.netUnits + 1, wins: paper.wins + 1 };
    case StepResult.LOSS:
      return { ...paper, unitsStaked: paper.unitsStaked + 1, netUnits: paper.netUnits - 1, losses: paper.losses + 1 };
    case StepResult.PUSH:
      return { ...paper, unitsStaked: paper.unitsStaked + 1, pushes: paper.pushes + 1 };
    default:
      return paper;
  }
}

/** Fold resolved, non-invalidated entries into fresh sequences + paper. */
function rebuild(entries: readonly PredictionEntry[]): {
  sequences: SessionSequences;
  paper: PaperTracking;
} {
  let engine = initialProfileSequences();
  let played = initialProfileSequences();
  let paper = emptyPaper();
  for (const e of entries) {
    if (e.invalidated) continue;
    if (e.result === StepResult.PENDING) continue;
    engine = advanceProfileMap(engine, e.result, e.prediction.category);
    if (e.operatorAction === OperatorAction.PLAYED) {
      played = advanceProfileMap(played, e.result, e.prediction.category);
      paper = applyPaper(paper, e.result);
    }
  }
  return { sequences: { engine, played }, paper };
}

export interface StartOptions extends ComputeOptions {
  readonly shoeId?: string;
}

/** START FLOW steps 4–10: snapshot -> features -> modules -> decision -> lock. */
export function startSession(
  rounds: readonly RoundRecord[],
  environment: SessionEnvironment,
  opts: StartOptions = {},
): SessionState {
  const nt = nonTieCount(rounds);
  if (nt < 8) throw new InsufficientHistoryError(nt);
  const shoeId = opts.shoeId ?? rounds[0]?.shoeId ?? `shoe-${Date.now()}`;
  const prediction = computePrediction(rounds, environment, shoeId, opts);
  return {
    version: SESSION_VERSION,
    workflow: WorkflowState.WAITING_FOR_RESULT,
    environment,
    shoeId,
    rounds: rounds.slice(),
    currentPrediction: prediction,
    predictions: [pending(prediction)],
    sequences: initialSequences(),
    revisions: [],
    paper: emptyPaper(),
    error: null,
  };
}

export interface SubmitOptions extends ComputeOptions {
  readonly operatorAction?: OperatorAction;
  readonly expectedTargetRound?: number;
  readonly revisionAffected?: boolean;
  readonly roundId?: string;
  readonly playerPair?: PairState;
  readonly bankerPair?: PairState;
}

/**
 * RESULT SUBMISSION (transactional): validate -> save actual -> evaluate locked
 * prediction -> update sequences -> build & lock the next prediction.
 */
export function submitResult(
  session: SessionState,
  winner: Winner,
  opts: SubmitOptions = {},
): SessionState {
  if (session.workflow !== WorkflowState.WAITING_FOR_RESULT) {
    throw new DuplicateResultError(session.workflow); // input disabled
  }
  const current = session.currentPrediction;
  if (!current) throw new DuplicateResultError('NO_PREDICTION');
  const target = current.targetRound;
  if (opts.expectedTargetRound != null && opts.expectedTargetRound !== target) {
    throw new TargetRoundError(target, opts.expectedTargetRound);
  }
  const action = opts.operatorAction ?? OperatorAction.NOT_PLAYED;
  const now = opts.now ?? new Date().toISOString();

  // 3. save actual round
  const round: RoundRecord = {
    id: opts.roundId ?? `${session.shoeId}-r${target}-${now}`,
    shoeId: session.shoeId,
    roundNumber: target,
    winner,
    playerPair: opts.playerPair ?? PairState.UNKNOWN,
    bankerPair: opts.bankerPair ?? PairState.UNKNOWN,
    source: sourceFor(session.environment),
    createdAt: now,
  };
  const nextRounds = [...session.rounds, round];

  // 4–6. evaluate locked prediction + update sequences
  const result = evaluatePrediction(current, winner, { revisionAffected: opts.revisionAffected });
  const resolved: PredictionEntry[] = session.predictions.map((e) =>
    e.prediction.id === current.id
      ? { ...e, result, actualWinner: winner, operatorAction: action }
      : e,
  );
  const engine = advanceProfileMap(session.sequences.engine, result, current.category);
  const played =
    action === OperatorAction.PLAYED
      ? advanceProfileMap(session.sequences.played, result, current.category)
      : session.sequences.played;
  const paper =
    action === OperatorAction.PLAYED ? applyPaper(session.paper, result) : session.paper;

  // 7–9. build + lock the next prediction
  const nextPrediction = computePrediction(nextRounds, session.environment, session.shoeId, opts);

  return {
    ...session,
    workflow: WorkflowState.WAITING_FOR_RESULT,
    rounds: nextRounds,
    currentPrediction: nextPrediction,
    predictions: [...resolved, pending(nextPrediction)],
    sequences: { engine, played },
    paper,
    error: null,
  };
}

/**
 * EDITING LIVE HISTORY: create a revision, invalidate affected predictions
 * (target round >= edited round), rebuild sequences from survivors, then create
 * a fresh snapshot + locked prediction. The old audit trail is never deleted.
 */
export function editHistory(
  session: SessionState,
  roundNumber: number,
  edit: RoundEdit,
  opts: ComputeOptions = {},
): SessionState {
  const now = opts.now ?? new Date().toISOString();
  const res = editRoundPure(session.rounds, roundNumber, edit, { now, newRoundId: '' });
  if (!res) throw new Error(`Cannot edit: round ${roundNumber} not found.`);

  const invalidated: PredictionEntry[] = session.predictions.map((e) =>
    e.prediction.targetRound >= roundNumber && !e.invalidated
      ? { ...e, invalidated: true, result: StepResult.INVALIDATED }
      : e,
  );
  const { sequences, paper } = rebuild(invalidated);
  const nextPrediction = computePrediction(res.rounds, session.environment, session.shoeId, opts);

  return {
    ...session,
    workflow: WorkflowState.WAITING_FOR_RESULT,
    rounds: res.rounds,
    revisions: [...session.revisions, res.revision],
    predictions: [...invalidated, pending(nextPrediction)],
    currentPrediction: nextPrediction,
    sequences,
    paper,
    error: null,
  };
}

/** New Shoe: ends any unfinished sequence and resets to a fresh session. */
export function newShoe(session: SessionState, opts: { shoeId?: string } = {}): SessionState {
  return {
    version: SESSION_VERSION,
    workflow: WorkflowState.HISTORY_INPUT,
    environment: session.environment,
    shoeId: opts.shoeId ?? `shoe-${Date.now()}`,
    rounds: [],
    currentPrediction: null,
    predictions: [],
    sequences: initialSequences(),
    revisions: [],
    paper: emptyPaper(),
    error: null,
  };
}

// --- persistence (restart reconstruction) ----------------------------------

export function serializeSession(session: SessionState): PersistedSession {
  return {
    version: session.version,
    workflow: session.workflow,
    environment: session.environment,
    shoeId: session.shoeId,
    rounds: session.rounds,
    predictions: session.predictions,
    revisions: session.revisions,
  };
}

/**
 * Rebuild session state after an application restart. The locked predictions
 * are RESTORED verbatim (never recomputed); sequences + paper are deterministically
 * replayed from the stored, resolved entries.
 */
export function reconstructSession(persisted: PersistedSession): SessionState {
  const { sequences, paper } = rebuild(persisted.predictions);
  const current =
    persisted.predictions.find((e) => e.result === StepResult.PENDING && !e.invalidated)?.prediction ??
    null;
  return {
    version: persisted.version,
    workflow: persisted.workflow,
    environment: persisted.environment,
    shoeId: persisted.shoeId,
    rounds: persisted.rounds,
    currentPrediction: current,
    predictions: persisted.predictions,
    sequences,
    revisions: persisted.revisions,
    paper,
    error: null,
  };
}
