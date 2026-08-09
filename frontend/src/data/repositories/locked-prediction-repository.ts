/**
 * DB-002 persistence for the Milestone-5 session (thin adapter — NO domain logic).
 *
 * Two responsibilities only:
 *   - `locked_prediction_entries` : store/load the authoritative locked-prediction
 *     audit as an immutable JSON payload + directly-queryable lifecycle columns.
 *   - `session_state`             : store/load per-shoe workflow/cursor metadata.
 *
 * All methods issue a SINGLE `runAsync`/`getAllAsync` (no internal transaction) so
 * the SessionStore can compose several writes inside ONE `withTransactionAsync`
 * (sql.js/SQLite forbid nested transactions).
 */
import { PredictionStatus } from '../../domain/models/enums';
import type { SqlDatabase } from '../database/sql-database';
import {
  OperatorAction,
  StepResult,
  type LockedPrediction,
  type PredictionEntry,
} from '../../domain/session';

export interface SessionStateRow {
  readonly shoeId: string;
  readonly sessionVersion: string;
  readonly workflow: string;
  readonly environment: string;
  readonly currentTargetRound: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface LpeRow {
  id: string;
  shoe_id: string;
  target_round_number: number;
  sequence_index: number;
  status: string;
  decision: string;
  side: string | null;
  confidence: number;
  category: string;
  operator_action: string;
  evaluation: string;
  actual_winner: string | null;
  invalidated: number;
  invalidated_by_revision_id: string | null;
  invalidated_at: string | null;
  locked_at: string;
  evaluated_at: string | null;
  payload_version: string;
  payload: string;
  created_at: string;
}

interface SessionStateDbRow {
  shoe_id: string;
  session_version: string;
  workflow: string;
  environment: string;
  current_target_round: number | null;
  created_at: string;
  updated_at: string;
}

/** Extra DB-only audit metadata not carried by the pure-domain PredictionEntry. */
export interface EntryPersistMeta {
  readonly sequenceIndex: number;
  readonly now: string;
  readonly invalidatedByRevisionId?: string | null;
  readonly invalidatedAt?: string | null;
  readonly evaluatedAt?: string | null;
}

/**
 * M7.2 Patch 1 — outcome of an idempotent lock persistence.
 *   - `canonicalId`: the id of the AUTHORITATIVE valid lock for (shoe, target)
 *     after the call (either the just-written candidate or a pre-existing lock).
 *   - `reconciled`: true when a DIFFERENT valid lock already held the
 *     (shoe, target) invariant, so the persisted immutable lock was reused and
 *     the candidate was NOT inserted (idempotent no-op, never an overwrite).
 */
export interface UpsertOutcome {
  readonly canonicalId: string;
  readonly reconciled: boolean;
}

/**
 * M7.2 Patch 1 — detect ONLY the expected `uq_lpe_valid_target` uniqueness
 * conflict (one valid lock per shoe + target). Matching is deliberately narrow
 * (references `target_round_number`) so unrelated SQLite errors are NEVER
 * swallowed by the idempotency reconciliation path.
 */
const isValidTargetUniqueConflict = (e: unknown): boolean => {
  const msg = e instanceof Error ? e.message : String(e);
  return /UNIQUE constraint failed/i.test(msg) && /target_round_number/i.test(msg);
};

const statusFor = (entry: PredictionEntry): PredictionStatus =>
  entry.invalidated
    ? PredictionStatus.VOID
    : entry.result === StepResult.PENDING
      ? PredictionStatus.LOCKED
      : PredictionStatus.EVALUATED;

const rowToEntry = (row: LpeRow): PredictionEntry => ({
  prediction: JSON.parse(row.payload) as LockedPrediction,
  result: row.evaluation as StepResult,
  actualWinner: (row.actual_winner as PredictionEntry['actualWinner']) ?? null,
  operatorAction: row.operator_action === 'UNSET' ? null : (row.operator_action as OperatorAction),
  invalidated: row.invalidated === 1,
});

export class LockedPredictionRepository {
  constructor(private readonly db: SqlDatabase) {}

  /**
   * Idempotently persist a locked prediction entry.
   *
   * M7.2 Patch 1 — the DB enforces AT MOST ONE valid (non-invalidated) lock per
   * (shoe, target) via the partial-unique index `uq_lpe_valid_target`. Because a
   * locked prediction's immutable id embeds the lock instant, the SAME
   * (shoe, target) recomputed at two moments (Start-Live double-invoke,
   * reconstruct-recovery re-entry, overlapping submit, retry-after-failure)
   * yields DIFFERENT ids — which the `ON CONFLICT(id)` upsert alone cannot
   * dedupe, previously surfacing a fatal `UNIQUE constraint failed` on native.
   *
   * This method makes persistence idempotent w.r.t. that invariant:
   *   1. Same-id re-persist  -> `ON CONFLICT(id) DO UPDATE` (lifecycle only; the
   *      immutable payload + identity columns are NEVER rewritten).
   *   2. A DIFFERENT valid lock already holds (shoe, target) -> the persisted
   *      immutable lock is AUTHORITATIVE: reuse it, do NOT insert/overwrite.
   *   3. Check-then-insert RACE (two writers both saw no lock) -> the losing
   *      INSERT hits `uq_lpe_valid_target`; that SPECIFIC conflict is caught and
   *      reconciled by re-reading the winning valid lock. Any other error
   *      propagates unchanged.
   *
   * Invalidated entries are exempt from the valid-target guard (invalidated rows
   * may coexist) and always take the id-keyed upsert path.
   */
  async upsert(entry: PredictionEntry, meta: EntryPersistMeta): Promise<UpsertOutcome> {
    const p = entry.prediction;
    const isValidLock = !entry.invalidated;

    // (2) Pre-check: a different valid lock already owns this (shoe, target).
    if (isValidLock) {
      const existingId = await this.findValidLockId(p.shoeId, p.targetRound);
      if (existingId != null && existingId !== p.id) {
        return { canonicalId: existingId, reconciled: true };
      }
    }

    try {
      await this.insertOrUpdateById(entry, meta);
      return { canonicalId: p.id, reconciled: false };
    } catch (e) {
      // (3) Reconcile ONLY the expected valid-target uniqueness race.
      if (isValidLock && isValidTargetUniqueConflict(e)) {
        const existingId = await this.findValidLockId(p.shoeId, p.targetRound);
        if (existingId != null && existingId !== p.id) {
          return { canonicalId: existingId, reconciled: true };
        }
      }
      throw e; // unrelated SQLite errors are never swallowed
    }
  }

  /** The id of the current valid (non-invalidated) lock for a target, if any. */
  async findValidLockId(shoeId: string, targetRound: number): Promise<string | null> {
    const row = await this.db.getFirstAsync<{ id: string }>(
      `SELECT id FROM locked_prediction_entries
         WHERE shoe_id = ? AND target_round_number = ? AND invalidated = 0
         LIMIT 1;`,
      [shoeId, targetRound],
    );
    return row?.id ?? null;
  }

  /**
   * Insert-or-update keyed by the immutable id. The immutable payload + identity
   * columns are written on INSERT and NEVER updated on conflict; only lifecycle
   * columns (status/operator/evaluation/invalidation) change — a locked
   * prediction is thus never silently rewritten.
   */
  private async insertOrUpdateById(entry: PredictionEntry, meta: EntryPersistMeta): Promise<void> {
    const p = entry.prediction;
    await this.db.runAsync(
      `INSERT INTO locked_prediction_entries (
         id, shoe_id, target_round_number, sequence_index, status, decision, side,
         confidence, category, operator_action, evaluation, actual_winner,
         invalidated, invalidated_by_revision_id, invalidated_at, locked_at,
         evaluated_at, payload_version, payload, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         status = excluded.status,
         operator_action = excluded.operator_action,
         evaluation = excluded.evaluation,
         actual_winner = excluded.actual_winner,
         invalidated = excluded.invalidated,
         invalidated_by_revision_id = excluded.invalidated_by_revision_id,
         invalidated_at = excluded.invalidated_at,
         evaluated_at = excluded.evaluated_at;`,
      [
        p.id,
        p.shoeId,
        p.targetRound,
        meta.sequenceIndex,
        statusFor(entry),
        p.decision,
        p.side,
        p.confidence,
        p.category,
        entry.operatorAction ?? 'UNSET',
        entry.result,
        entry.actualWinner,
        entry.invalidated ? 1 : 0,
        meta.invalidatedByRevisionId ?? null,
        meta.invalidatedAt ?? null,
        p.lockedAt,
        meta.evaluatedAt ?? (entry.result === StepResult.PENDING ? null : meta.now),
        'SESSION-001',
        JSON.stringify(p),
        meta.now,
      ],
    );
  }

  async listByShoe(shoeId: string): Promise<PredictionEntry[]> {
    const rows = await this.db.getAllAsync<LpeRow>(
      'SELECT * FROM locked_prediction_entries WHERE shoe_id = ? ORDER BY sequence_index ASC;',
      [shoeId],
    );
    return rows.map(rowToEntry);
  }

  async countValidForTarget(shoeId: string, targetRound: number): Promise<number> {
    const row = await this.db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM locked_prediction_entries
         WHERE shoe_id = ? AND target_round_number = ? AND invalidated = 0;`,
      [shoeId, targetRound],
    );
    return row?.n ?? 0;
  }

  async maxSequenceIndex(shoeId: string): Promise<number> {
    const row = await this.db.getFirstAsync<{ m: number | null }>(
      'SELECT MAX(sequence_index) AS m FROM locked_prediction_entries WHERE shoe_id = ?;',
      [shoeId],
    );
    return row?.m ?? -1;
  }

  // --- session_state -------------------------------------------------------

  async getState(shoeId: string): Promise<SessionStateRow | null> {
    const row = await this.db.getFirstAsync<SessionStateDbRow>(
      'SELECT * FROM session_state WHERE shoe_id = ?;',
      [shoeId],
    );
    if (!row) return null;
    return {
      shoeId: row.shoe_id,
      sessionVersion: row.session_version,
      workflow: row.workflow,
      environment: row.environment,
      currentTargetRound: row.current_target_round,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async upsertState(state: {
    shoeId: string;
    sessionVersion: string;
    workflow: string;
    environment: string;
    currentTargetRound: number | null;
    paperUnitsStaked: number;
    paperNetUnits: number;
    paperWins: number;
    paperLosses: number;
    paperPushes: number;
    now: string;
  }): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO session_state (
         shoe_id, session_version, workflow, environment, current_target_round,
         paper_units_staked, paper_net_units, paper_wins, paper_losses, paper_pushes,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(shoe_id) DO UPDATE SET
         session_version = excluded.session_version,
         workflow = excluded.workflow,
         environment = excluded.environment,
         current_target_round = excluded.current_target_round,
         paper_units_staked = excluded.paper_units_staked,
         paper_net_units = excluded.paper_net_units,
         paper_wins = excluded.paper_wins,
         paper_losses = excluded.paper_losses,
         paper_pushes = excluded.paper_pushes,
         updated_at = excluded.updated_at;`,
      [
        state.shoeId,
        state.sessionVersion,
        state.workflow,
        state.environment,
        state.currentTargetRound,
        state.paperUnitsStaked,
        state.paperNetUnits,
        state.paperWins,
        state.paperLosses,
        state.paperPushes,
        state.now,
        state.now,
      ],
    );
  }
}
