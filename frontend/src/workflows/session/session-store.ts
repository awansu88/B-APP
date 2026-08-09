/**
 * Milestone-5 persistent live-session store (thin adapter over the pure domain).
 *
 * The store owns NO business logic — prediction/evaluation/sequence/paper/
 * invalidation semantics live entirely in `src/domain/session/*`. The store only
 * persists + reconstructs authoritative state and enforces two runtime invariants:
 *
 *   1. LOCK-BEFORE-RESULT: an actual result for target N is accepted ONLY when a
 *      valid (non-invalidated) locked prediction for N is already persisted. All
 *      writes for a transition happen in ONE transaction, so a failed persist
 *      leaves the prior state untouched (no orphan result / partial lock).
 *   2. IDENTITY: the DB partial-unique index guarantees at most one valid lock
 *      per (shoe, target); reconstruction rebuilds sequences/paper from the
 *      authoritative locked entries.
 *
 * Recovery rule (documented + tested): after a result commits, if no valid
 * pending lock exists for the next target, `reconstruct` deterministically
 * regenerates and persists it before another actual result may be accepted.
 */
import type { SqlDatabase } from '@/src/data/database/sql-database';
import { LockedPredictionRepository } from '@/src/data/repositories/locked-prediction-repository';
import { RoundSource } from '@/src/domain/models/enums';
import { PairState } from '@/src/domain/models/pair';
import { Winner } from '@/src/domain/models/outcome';
import type { RoundRecord } from '@/src/domain/models/round';
import type { RevisionRecord } from '@/src/domain/models/records';
import {
  OperatorAction,
  StepResult,
  WorkflowState,
  computePrediction,
  editHistory as editHistoryPure,
  deleteHistory as deleteHistoryPure,
  reconstructSession,
  startSession as startSessionPure,
  submitResult as submitResultPure,
  type PersistedSession,
  type PredictionEntry,
  type SessionState,
} from '@/src/domain/session';
import { SessionEnvironment } from '@/src/domain/session';
import {
  balancedDecisionConfig,
  resolveShoeThresholdFromLocks,
  type BalancedDecisionConfig,
  type EngineProfileId,
} from '@/src/domain/decision';
import type { MatcherCorpus } from '@/src/domain/matcher';
import type { RoundEdit } from '@/src/domain/history';

/** Minimal key/value backend (structurally satisfied by `@/src/utils/storage`). */
export interface KvStore {
  getItem(key: string, fallback: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<boolean>;
}

export interface StartLiveOptions {
  readonly now?: string;
  readonly historyConfirmed?: boolean;
  /** M7.1 Patch 2 — selected engine profile for the OFFICIAL lock. Default STRICT. */
  readonly profile?: EngineProfileId;
  /** M7.1 Patch 3 Stage B1 — pre-result Historical Matcher corpus (DB-002 archived history). */
  readonly matcherCorpus?: MatcherCorpus;
  /** M7.1 Patch 4 — immutable per-shoe Balanced Threshold-Lab config (BALCFG-001). */
  readonly balancedConfig?: BalancedDecisionConfig;
}

export interface SubmitOptions {
  readonly now?: string;
  readonly operatorAction?: OperatorAction;
  readonly expectedTargetRound?: number;
  readonly historyConfirmed?: boolean;
  readonly roundId?: string;
  readonly playerPair?: PairState;
  readonly bankerPair?: PairState;
  /** M7.1 Patch 2 — selected engine profile for the OFFICIAL lock. Default STRICT. */
  readonly profile?: EngineProfileId;
  /** M7.1 Patch 3 Stage B1 — pre-result Historical Matcher corpus (DB-002 archived history). */
  readonly matcherCorpus?: MatcherCorpus;
  /** M7.1 Patch 4 — immutable per-shoe Balanced Threshold-Lab config (BALCFG-001). */
  readonly balancedConfig?: BalancedDecisionConfig;
}

/** Persistence contract shared by the native (SQLite/DB-002) and web adapters. */
export type SessionStoreKind = 'sqlite' | 'memory';
export interface CreatedSessionStore {
  readonly store: SessionStore;
  readonly kind: SessionStoreKind;
}

/**
 * Raised when durable Milestone-5 persistence (SQLite/DB-002) cannot be
 * initialized on a NATIVE device. The live workflow must NOT silently continue
 * on a volatile store — the caller surfaces a retryable error and disables
 * actual-result submission instead.
 */
export class SessionPersistenceUnavailableError extends Error {
  constructor(readonly cause?: unknown) {
    super('Live session persistence (SQLite/DB-002) is unavailable on this device.');
    this.name = 'SessionPersistenceUnavailableError';
  }
}

export interface SessionStore {
  startLive(
    shoeId: string,
    rounds: readonly RoundRecord[],
    environment: SessionEnvironment,
    opts?: StartLiveOptions,
  ): Promise<SessionState>;
  submitResult(shoeId: string, winner: Winner, opts?: SubmitOptions): Promise<SessionState>;
  editHistory(
    shoeId: string,
    roundNumber: number,
    edit: RoundEdit,
    opts?: StartLiveOptions,
  ): Promise<SessionState>;
  deleteHistory(
    shoeId: string,
    roundNumber: number,
    opts?: StartLiveOptions,
  ): Promise<SessionState>;
  reconstruct(shoeId: string): Promise<SessionState | null>;
}

const pendingEntry = (s: SessionState): PredictionEntry | undefined =>
  s.predictions.find((e) => e.result === StepResult.PENDING && !e.invalidated);

const latestRevisionId = (before: readonly RevisionRecord[], after: readonly RevisionRecord[]) =>
  after.length > before.length ? after[after.length - 1].id : null;

// ==========================================================================
// Native SQLite / DB-002 store (authoritative production architecture)
// ==========================================================================
export class SqliteSessionStore implements SessionStore {
  private readonly lpe: LockedPredictionRepository;

  constructor(private readonly db: SqlDatabase) {
    this.lpe = new LockedPredictionRepository(db);
  }

  async startLive(
    shoeId: string,
    rounds: readonly RoundRecord[],
    environment: SessionEnvironment,
    opts: StartLiveOptions = {},
  ): Promise<SessionState> {
    const now = opts.now ?? new Date().toISOString();
    const state = startSessionPure(rounds, environment, { ...opts, now, shoeId });
    await this.db.withTransactionAsync(async () => {
      // Persist the first locked prediction FIRST (lock-before-result); the
      // session_state cursor is written in the same transaction.
      await this.persistEntries(state, now);
      await this.persistCursor(state, now);
    });
    return state;
  }

  async submitResult(shoeId: string, winner: Winner, opts: SubmitOptions = {}): Promise<SessionState> {
    const now = opts.now ?? new Date().toISOString();
    const current = await this.reconstruct(shoeId);
    if (!current) throw new Error(`No persisted session for shoe ${shoeId}.`);
    const lockedTarget = current.currentPrediction?.targetRound;
    // HARD INVARIANT: the lock for target N must already be persisted & valid.
    if (lockedTarget == null || (await this.lpe.countValidForTarget(shoeId, lockedTarget)) !== 1) {
      throw new Error('Lock-before-result violation: no valid persisted lock for the next target.');
    }
    const next = submitResultPure(current, winner, { ...opts, now });
    const round = next.rounds[next.rounds.length - 1];
    await this.db.withTransactionAsync(async () => {
      await this.insertRoundTx(round, now);
      await this.persistEntries(next, now); // resolves N + inserts pending N+1
      await this.persistCursor(next, now);
    });
    return next;
  }

  async editHistory(
    shoeId: string,
    roundNumber: number,
    edit: RoundEdit,
    opts: StartLiveOptions = {},
  ): Promise<SessionState> {
    const now = opts.now ?? new Date().toISOString();
    const current = await this.reconstruct(shoeId);
    if (!current) throw new Error(`No persisted session for shoe ${shoeId}.`);
    const next = editHistoryPure(current, roundNumber, edit, { ...opts, now });
    const revisionId = latestRevisionId(current.revisions, next.revisions);
    await this.db.withTransactionAsync(async () => {
      await this.replaceRoundsTx(shoeId, next.rounds, next.revisions[next.revisions.length - 1], now);
      await this.persistEntries(next, now, { revisionId, roundNumber });
      await this.persistCursor(next, now);
    });
    return next;
  }

  async deleteHistory(
    shoeId: string,
    roundNumber: number,
    opts: StartLiveOptions = {},
  ): Promise<SessionState> {
    const now = opts.now ?? new Date().toISOString();
    const current = await this.reconstruct(shoeId);
    if (!current) throw new Error(`No persisted session for shoe ${shoeId}.`);
    const next = deleteHistoryPure(current, roundNumber, { ...opts, now });
    const revisionId = latestRevisionId(current.revisions, next.revisions);
    await this.db.withTransactionAsync(async () => {
      await this.replaceRoundsTx(shoeId, next.rounds, next.revisions[next.revisions.length - 1], now);
      await this.persistEntries(next, now, { revisionId, roundNumber });
      await this.persistCursor(next, now);
    });
    return next;
  }

  async reconstruct(shoeId: string): Promise<SessionState | null> {
    const cursor = await this.lpe.getState(shoeId);
    if (!cursor) return null;
    const rounds = await this.loadRounds(shoeId);
    const predictions = await this.lpe.listByShoe(shoeId);
    const revisions = await this.loadRevisions(shoeId);
    const persisted: PersistedSession = {
      version: cursor.sessionVersion,
      workflow: cursor.workflow as WorkflowState,
      environment: cursor.environment as SessionEnvironment,
      shoeId,
      rounds,
      predictions,
      revisions,
    };
    let state = reconstructSession(persisted);
    // Recovery rule: if a live session has no valid pending lock for the next
    // target, deterministically regenerate + persist it before proceeding.
    if (
      state.workflow === WorkflowState.WAITING_FOR_RESULT &&
      state.rounds.length > 0 &&
      !pendingEntry(state)
    ) {
      const now = new Date().toISOString();
      // M7.1 Patch 4 — the recovery-regenerated pending lock MUST carry the
      // shoe's immutable BALCFG-001 threshold (recovered from existing valid
      // locks) so it never becomes a contradictory lock. Legacy shoes (no
      // BALCFG lock) regenerate without a Balanced config (DECISION-003).
      const validLocks = state.predictions
        .filter((e) => !e.invalidated)
        .map((e) => e.prediction);
      const shoeThreshold = resolveShoeThresholdFromLocks(validLocks);
      const regenerated = computePrediction(state.rounds, state.environment, shoeId, {
        now,
        historyConfirmed: true,
        ...(shoeThreshold != null ? { balancedConfig: balancedDecisionConfig(shoeThreshold) } : {}),
      });
      const entries = [
        ...state.predictions,
        {
          prediction: regenerated,
          result: StepResult.PENDING,
          actualWinner: null,
          operatorAction: null,
          invalidated: false,
        } as PredictionEntry,
      ];
      const candidate = reconstructSession({ ...persisted, predictions: entries });
      await this.db.withTransactionAsync(async () => {
        await this.persistEntries(candidate, now);
        await this.persistCursor(candidate, now);
      });
      // M7.2 Patch 1 — re-read the AUTHORITATIVE persisted entries so the
      // returned state reflects the canonical lock even when the regenerated
      // pending lock was idempotently reconciled to an already-persisted lock
      // (concurrent reconstruct / Start-Live re-entry). This never inserts a
      // duplicate and never overwrites the immutable persisted payload.
      const persistedEntries = await this.lpe.listByShoe(shoeId);
      state = reconstructSession({ ...persisted, predictions: persistedEntries });
    }
    return state;
  }

  // --- private persistence primitives (all single runAsync; no nested tx) ---

  private async persistEntries(
    state: SessionState,
    now: string,
    inval?: { revisionId: string | null; roundNumber: number },
  ): Promise<void> {
    for (let i = 0; i < state.predictions.length; i += 1) {
      const entry = state.predictions[i];
      const isInvalidatedNow = entry.invalidated && inval != null;
      await this.lpe.upsert(entry, {
        sequenceIndex: i,
        now,
        invalidatedByRevisionId: isInvalidatedNow ? inval!.revisionId : undefined,
        invalidatedAt: isInvalidatedNow ? now : undefined,
      });
    }
  }

  private async persistCursor(state: SessionState, now: string): Promise<void> {
    await this.lpe.upsertState({
      shoeId: state.shoeId,
      sessionVersion: state.version,
      workflow: state.workflow,
      environment: state.environment,
      currentTargetRound: state.currentPrediction?.targetRound ?? null,
      paperUnitsStaked: state.paper.unitsStaked,
      paperNetUnits: state.paper.netUnits,
      paperWins: state.paper.wins,
      paperLosses: state.paper.losses,
      paperPushes: state.paper.pushes,
      now,
    });
  }

  private async insertRoundTx(round: RoundRecord, now: string): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO rounds (id, shoe_id, round_number, winner, player_pair, banker_pair, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [round.id, round.shoeId, round.roundNumber, round.winner, round.playerPair, round.bankerPair, round.source, round.createdAt],
    );
    await this.db.runAsync(
      `INSERT INTO revisions (id, shoe_id, round_number, action, before, after, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [`rev-${round.id}-insert`, round.shoeId, round.roundNumber, 'INSERT', null, JSON.stringify(round), now],
    );
  }

  private async replaceRoundsTx(
    shoeId: string,
    rounds: readonly RoundRecord[],
    revision: RevisionRecord,
    _now: string,
  ): Promise<void> {
    await this.db.runAsync('DELETE FROM rounds WHERE shoe_id = ?;', [shoeId]);
    for (const r of rounds) {
      await this.db.runAsync(
        `INSERT INTO rounds (id, shoe_id, round_number, winner, player_pair, banker_pair, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [r.id, r.shoeId, r.roundNumber, r.winner, r.playerPair, r.bankerPair, r.source, r.createdAt],
      );
    }
    await this.db.runAsync(
      `INSERT INTO revisions (id, shoe_id, round_number, action, before, after, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [revision.id, revision.shoeId, revision.roundNumber, revision.action, revision.before, revision.after, revision.createdAt],
    );
  }

  private async loadRounds(shoeId: string): Promise<RoundRecord[]> {
    const rows = await this.db.getAllAsync<{
      id: string; shoe_id: string; round_number: number; winner: string;
      player_pair: string; banker_pair: string; source: string; created_at: string;
    }>('SELECT * FROM rounds WHERE shoe_id = ? ORDER BY round_number ASC;', [shoeId]);
    return rows.map((r) => ({
      id: r.id,
      shoeId: r.shoe_id,
      roundNumber: r.round_number,
      winner: r.winner as Winner,
      playerPair: r.player_pair as PairState,
      bankerPair: r.banker_pair as PairState,
      source: r.source as RoundSource,
      createdAt: r.created_at,
    }));
  }

  private async loadRevisions(shoeId: string): Promise<RevisionRecord[]> {
    const rows = await this.db.getAllAsync<{
      id: string; shoe_id: string; round_number: number | null; action: string;
      before: string | null; after: string | null; created_at: string;
    }>('SELECT * FROM revisions WHERE shoe_id = ? ORDER BY created_at ASC, id ASC;', [shoeId]);
    return rows.map((r) => ({
      id: r.id,
      shoeId: r.shoe_id,
      roundNumber: r.round_number,
      action: r.action as RevisionRecord['action'],
      before: r.before,
      after: r.after,
      createdAt: r.created_at,
    }));
  }
}

// ==========================================================================
// Web fallback (AsyncStorage) — same contract, NO duplicated business rules.
// Persists the serialized session; domain reducers do all the work.
// ==========================================================================
const webKey = (shoeId: string) => `bapp.session.v1.${shoeId}`;

export class MemorySessionStore implements SessionStore {
  constructor(private readonly kv: KvStore) {}

  async startLive(
    shoeId: string,
    rounds: readonly RoundRecord[],
    environment: SessionEnvironment,
    opts: StartLiveOptions = {},
  ): Promise<SessionState> {
    const state = startSessionPure(rounds, environment, { ...opts, shoeId });
    await this.write(shoeId, state);
    return state;
  }

  async submitResult(shoeId: string, winner: Winner, opts: SubmitOptions = {}): Promise<SessionState> {
    const current = await this.reconstruct(shoeId);
    if (!current) throw new Error(`No persisted session for shoe ${shoeId}.`);
    if (!pendingEntry(current)) {
      throw new Error('Lock-before-result violation: no valid persisted lock for the next target.');
    }
    const next = submitResultPure(current, winner, opts);
    await this.write(shoeId, next);
    return next;
  }

  async editHistory(
    shoeId: string,
    roundNumber: number,
    edit: RoundEdit,
    opts: StartLiveOptions = {},
  ): Promise<SessionState> {
    const current = await this.reconstruct(shoeId);
    if (!current) throw new Error(`No persisted session for shoe ${shoeId}.`);
    const next = editHistoryPure(current, roundNumber, edit, opts);
    await this.write(shoeId, next);
    return next;
  }

  async deleteHistory(
    shoeId: string,
    roundNumber: number,
    opts: StartLiveOptions = {},
  ): Promise<SessionState> {
    const current = await this.reconstruct(shoeId);
    if (!current) throw new Error(`No persisted session for shoe ${shoeId}.`);
    const next = deleteHistoryPure(current, roundNumber, opts);
    await this.write(shoeId, next);
    return next;
  }

  async reconstruct(shoeId: string): Promise<SessionState | null> {
    const raw = await this.kv.getItem(webKey(shoeId), '');
    if (!raw) return null;
    try {
      return reconstructSession(JSON.parse(raw) as PersistedSession);
    } catch {
      return null;
    }
  }

  private async write(shoeId: string, state: SessionState): Promise<void> {
    const persisted: PersistedSession = {
      version: state.version,
      workflow: state.workflow,
      environment: state.environment,
      shoeId,
      rounds: state.rounds,
      predictions: state.predictions,
      revisions: state.revisions,
    };
    await this.kv.setItem(webKey(shoeId), JSON.stringify(persisted));
  }
}
