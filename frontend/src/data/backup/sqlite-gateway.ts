/**
 * Milestone 6 — SQLite data gateway (DATA layer; binds to `SqlDatabase`).
 *
 * The AUTHORITATIVE read + transactional write path for Statistics, Export,
 * Merge apply and Restore. Runs unchanged against expo-sqlite (native) and
 * sql.js (tests). Pure merge/validation rules live in `src/domain/backup/*`;
 * this gateway only performs I/O and wraps writes in ONE transaction so a
 * failure rolls back cleanly (no partial datasets).
 *
 * It NEVER regenerates historical locked predictions: payloads are read and
 * written verbatim.
 */
import type { SqlDatabase, SqlParams } from '../database/sql-database';
import { CURRENT_DB_VERSION } from '../database/migrations';
import { PairState } from '../../domain/models/pair';
import { Winner } from '../../domain/models/outcome';
import { RoundSource, SessionEnvironment, ShoeStatus } from '../../domain/models/enums';
import type { RoundRecord } from '../../domain/models/round';
import type { RevisionRecord, ShoeRecord } from '../../domain/models/records';
import type {
  BappDataset,
  LockedPredictionEntryRecord,
  SessionStateRecord,
} from '../../domain/backup/dataset';
import type { BappExport } from '../../domain/backup/format';
import type { MergePlan } from '../../domain/backup/merge';

interface ShoeRow {
  id: string; label: string | null; environment: string; status: string;
  round_count: number; created_at: string; updated_at: string;
}
interface RoundRow {
  id: string; shoe_id: string; round_number: number; winner: string;
  player_pair: string; banker_pair: string; source: string; created_at: string;
}
interface RevisionRow {
  id: string; shoe_id: string; round_number: number | null; action: string;
  before: string | null; after: string | null; created_at: string;
}
interface LpeRow {
  id: string; shoe_id: string; target_round_number: number; sequence_index: number;
  status: string; decision: string; side: string | null; confidence: number;
  category: string; operator_action: string; evaluation: string; actual_winner: string | null;
  invalidated: number; invalidated_by_revision_id: string | null; invalidated_at: string | null;
  locked_at: string; evaluated_at: string | null; payload_version: string; payload: string;
  created_at: string;
}
interface SessionRow {
  shoe_id: string; session_version: string; workflow: string; environment: string;
  current_target_round: number | null; paper_units_staked: number; paper_net_units: number;
  paper_wins: number; paper_losses: number; paper_pushes: number;
  created_at: string; updated_at: string;
}

const toShoe = (r: ShoeRow): ShoeRecord => ({
  id: r.id,
  label: r.label,
  environment: r.environment as SessionEnvironment,
  status: r.status as ShoeStatus,
  roundCount: r.round_count,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const toRound = (r: RoundRow): RoundRecord => ({
  id: r.id,
  shoeId: r.shoe_id,
  roundNumber: r.round_number,
  winner: r.winner as Winner,
  playerPair: r.player_pair as PairState,
  bankerPair: r.banker_pair as PairState,
  source: r.source as RoundSource,
  createdAt: r.created_at,
});
const toRevision = (r: RevisionRow): RevisionRecord => ({
  id: r.id,
  shoeId: r.shoe_id,
  roundNumber: r.round_number,
  action: r.action as RevisionRecord['action'],
  before: r.before,
  after: r.after,
  createdAt: r.created_at,
});
const toLpe = (r: LpeRow): LockedPredictionEntryRecord => ({
  id: r.id,
  shoeId: r.shoe_id,
  targetRoundNumber: r.target_round_number,
  sequenceIndex: r.sequence_index,
  status: r.status,
  decision: r.decision,
  side: r.side,
  confidence: r.confidence,
  category: r.category,
  operatorAction: r.operator_action,
  evaluation: r.evaluation,
  actualWinner: r.actual_winner,
  invalidated: r.invalidated === 1,
  invalidatedByRevisionId: r.invalidated_by_revision_id,
  invalidatedAt: r.invalidated_at,
  lockedAt: r.locked_at,
  evaluatedAt: r.evaluated_at,
  payloadVersion: r.payload_version,
  payload: r.payload,
  createdAt: r.created_at,
});
const toSession = (r: SessionRow): SessionStateRecord => ({
  shoeId: r.shoe_id,
  sessionVersion: r.session_version,
  workflow: r.workflow,
  environment: r.environment,
  currentTargetRound: r.current_target_round,
  paperUnitsStaked: r.paper_units_staked,
  paperNetUnits: r.paper_net_units,
  paperWins: r.paper_wins,
  paperLosses: r.paper_losses,
  paperPushes: r.paper_pushes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** Read the entire authoritative dataset (read-only projection). */
export async function loadDataset(db: SqlDatabase): Promise<BappDataset> {
  const shoes = await db.getAllAsync<ShoeRow>('SELECT * FROM shoes ORDER BY created_at ASC, id ASC;');
  const rounds = await db.getAllAsync<RoundRow>('SELECT * FROM rounds ORDER BY shoe_id ASC, round_number ASC;');
  const revisions = await db.getAllAsync<RevisionRow>('SELECT * FROM revisions ORDER BY created_at ASC, id ASC;');
  const lpe = await db.getAllAsync<LpeRow>('SELECT * FROM locked_prediction_entries ORDER BY shoe_id ASC, sequence_index ASC;');
  const sessions = await db.getAllAsync<SessionRow>('SELECT * FROM session_state;');
  return {
    shoes: shoes.map(toShoe),
    rounds: rounds.map(toRound),
    revisions: revisions.map(toRevision),
    lockedPredictions: lpe.map(toLpe),
    sessionStates: sessions.map(toSession),
  };
}

// --- insert primitives (single runAsync each; caller owns the transaction) --

async function insertShoe(db: SqlDatabase, s: ShoeRecord): Promise<void> {
  const params: SqlParams = [s.id, s.label, s.environment, s.status, s.roundCount, s.createdAt, s.updatedAt];
  await db.runAsync(
    `INSERT INTO shoes (id, label, environment, status, round_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?);`,
    params,
  );
}
async function insertRound(db: SqlDatabase, r: RoundRecord): Promise<void> {
  const params: SqlParams = [r.id, r.shoeId, r.roundNumber, r.winner, r.playerPair, r.bankerPair, r.source, r.createdAt];
  await db.runAsync(
    `INSERT INTO rounds (id, shoe_id, round_number, winner, player_pair, banker_pair, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    params,
  );
}
async function insertRevision(db: SqlDatabase, r: RevisionRecord): Promise<void> {
  const params: SqlParams = [r.id, r.shoeId, r.roundNumber, r.action, r.before, r.after, r.createdAt];
  await db.runAsync(
    `INSERT INTO revisions (id, shoe_id, round_number, action, before, after, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?);`,
    params,
  );
}
async function insertLpe(db: SqlDatabase, p: LockedPredictionEntryRecord): Promise<void> {
  const params: SqlParams = [
    p.id, p.shoeId, p.targetRoundNumber, p.sequenceIndex, p.status, p.decision, p.side,
    p.confidence, p.category, p.operatorAction, p.evaluation, p.actualWinner,
    p.invalidated ? 1 : 0, p.invalidatedByRevisionId, p.invalidatedAt, p.lockedAt,
    p.evaluatedAt, p.payloadVersion, p.payload, p.createdAt,
  ];
  await db.runAsync(
    `INSERT INTO locked_prediction_entries (
       id, shoe_id, target_round_number, sequence_index, status, decision, side,
       confidence, category, operator_action, evaluation, actual_winner,
       invalidated, invalidated_by_revision_id, invalidated_at, locked_at,
       evaluated_at, payload_version, payload, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    params,
  );
}
async function insertSession(db: SqlDatabase, s: SessionStateRecord): Promise<void> {
  const params: SqlParams = [
    s.shoeId, s.sessionVersion, s.workflow, s.environment, s.currentTargetRound,
    s.paperUnitsStaked, s.paperNetUnits, s.paperWins, s.paperLosses, s.paperPushes,
    s.createdAt, s.updatedAt,
  ];
  await db.runAsync(
    `INSERT INTO session_state (
       shoe_id, session_version, workflow, environment, current_target_round,
       paper_units_staked, paper_net_units, paper_wins, paper_losses, paper_pushes,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    params,
  );
}

/** Insert a dataset in FK-safe order (shoes first). Caller owns the transaction. */
async function insertDataset(db: SqlDatabase, data: BappDataset): Promise<void> {
  for (const s of data.shoes) await insertShoe(db, s);
  for (const r of data.rounds) await insertRound(db, r);
  for (const rv of data.revisions) await insertRevision(db, rv);
  for (const p of data.lockedPredictions) await insertLpe(db, p);
  for (const s of data.sessionStates) await insertSession(db, s);
}

/**
 * Apply a safe merge plan transactionally. Throws (and rolls back) if the plan
 * is unsafe (has conflicts / invalid records) or any insert fails.
 */
export async function applyMerge(db: SqlDatabase, plan: MergePlan): Promise<void> {
  if (!plan.safe) {
    throw new Error('Refusing to apply an unsafe merge plan (conflicts or invalid records present).');
  }
  await db.withTransactionAsync(async () => {
    await insertDataset(db, plan.toAdd);
  });
}

export interface RestoreResult {
  readonly shoes: number;
  readonly rounds: number;
  readonly revisions: number;
  readonly lockedPredictions: number;
  readonly sessionStates: number;
}

/**
 * Destructive transactional RESTORE from a FULL_BACKUP export. Existing data is
 * removed and replaced ATOMICALLY — a mid-restore failure rolls back to the
 * pre-restore state (no partial dataset). Caller MUST validate first.
 */
export async function restoreBackup(db: SqlDatabase, exp: BappExport): Promise<RestoreResult> {
  if (exp.meta.kind !== 'FULL_BACKUP') {
    throw new Error(`Restore requires a FULL_BACKUP export (got ${exp.meta.kind}).`);
  }
  const data: BappDataset = {
    shoes: exp.data.shoes,
    rounds: exp.data.rounds,
    revisions: exp.data.revisions,
    lockedPredictions: exp.data.lockedPredictions,
    sessionStates: exp.data.sessionStates,
  };
  await db.withTransactionAsync(async () => {
    // Delete children first, then parents (explicit; independent of CASCADE).
    await db.runAsync('DELETE FROM locked_prediction_entries;');
    await db.runAsync('DELETE FROM session_state;');
    await db.runAsync('DELETE FROM revisions;');
    await db.runAsync('DELETE FROM rounds;');
    await db.runAsync('DELETE FROM shoes;');
    await insertDataset(db, data);
  });
  return {
    shoes: data.shoes.length,
    rounds: data.rounds.length,
    revisions: data.revisions.length,
    lockedPredictions: data.lockedPredictions.length,
    sessionStates: data.sessionStates.length,
  };
}

/** The DB schema version this gateway targets (DB-002). */
export const GATEWAY_SCHEMA_VERSION = CURRENT_DB_VERSION;
