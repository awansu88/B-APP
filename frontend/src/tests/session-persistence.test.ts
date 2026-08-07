/**
 * DB-002 persistent locked-session tests (Milestone 5B continuation).
 *
 * Exercises the additive DB-002 migration, the LockedPredictionRepository,
 * and the SqliteSessionStore / MemorySessionStore against a real in-memory
 * sql.js SQLite database. Covers: migration (fresh + existing DB-001),
 * database-enforced uniqueness, revision linkage, lock-before-result failure,
 * transactional recovery, and crash/restart invariants A–G.
 */
import {
  SessionEnvironment as ModelEnv,
  ShoeStatus,
  RoundSource,
} from '@/src/domain/models/enums';
import { Winner } from '@/src/domain/models/outcome';
import { PairState } from '@/src/domain/models/pair';
import type { RoundRecord } from '@/src/domain/models/round';
import type { ShoeRecord } from '@/src/domain/models/records';
import { DB_001_STATEMENTS } from '@/src/data/database/schema';
import { runMigrations } from '@/src/data/database/migrations';
import type { SqlDatabase, SqlParams, SqlRunResult } from '@/src/data/database/sql-database';
import { ShoeRepository } from '@/src/data/repositories/shoe-repository';
import { RoundRepository } from '@/src/data/repositories/round-repository';
import { LockedPredictionRepository } from '@/src/data/repositories/locked-prediction-repository';
import { SqlJsDatabase } from './support/sqljs-database';
import {
  SessionEnvironment,
  SessionProfile,
  StepResult,
  OperatorAction,
  type PredictionEntry,
} from '@/src/domain/session';
import {
  SqliteSessionStore,
  MemorySessionStore,
  type KvStore,
} from '@/src/workflows/session/session-store';

const NOW = '2026-01-01T00:00:00.000Z';
const SHOE = 's1';
const EXP = SessionProfile.EXPERIMENTAL_PLUS;

const makeShoe = (id: string): ShoeRecord => ({
  id,
  label: null,
  environment: ModelEnv.LIVE_FORWARD,
  status: ShoeStatus.ACTIVE,
  roundCount: 0,
  createdAt: NOW,
  updatedAt: NOW,
});

const makeRound = (n: number, winner: Winner): RoundRecord => ({
  id: `${SHOE}-r${n}`,
  shoeId: SHOE,
  roundNumber: n,
  winner,
  playerPair: PairState.UNKNOWN,
  bankerPair: PairState.UNKNOWN,
  source: RoundSource.HISTORY,
  createdAt: NOW,
});

const bankerRounds = (n: number): RoundRecord[] =>
  Array.from({ length: n }, (_, i) => makeRound(i + 1, Winner.BANKER));

async function migratedDb(): Promise<SqlDatabase> {
  const db = await SqlJsDatabase.open();
  await runMigrations(db);
  return db;
}

/** Fresh migrated DB seeded with a shoe + `n` banker rounds (DB-001 history). */
async function seededDb(n = 12): Promise<{ db: SqlDatabase; rounds: RoundRecord[] }> {
  const db = await migratedDb();
  await new ShoeRepository(db).insert(makeShoe(SHOE));
  const rounds = bankerRounds(n);
  const roundRepo = new RoundRepository(db);
  for (const r of rounds) await roundRepo.append(r);
  return { db, rounds };
}

/** Fault-injecting driver: throws when a SQL statement matches `failOn`. */
class FaultyDb implements SqlDatabase {
  constructor(
    private readonly inner: SqlDatabase,
    private readonly failOn: string,
  ) {}
  async execAsync(sql: string): Promise<void> {
    if (sql.includes(this.failOn)) throw new Error(`fault-inject exec: ${this.failOn}`);
    return this.inner.execAsync(sql);
  }
  async runAsync(sql: string, params: SqlParams = []): Promise<SqlRunResult> {
    if (sql.includes(this.failOn)) throw new Error(`fault-inject run: ${this.failOn}`);
    return this.inner.runAsync(sql, params);
  }
  getAllAsync<T = Record<string, unknown>>(sql: string, params?: SqlParams): Promise<T[]> {
    return this.inner.getAllAsync<T>(sql, params);
  }
  getFirstAsync<T = Record<string, unknown>>(sql: string, params?: SqlParams): Promise<T | null> {
    return this.inner.getFirstAsync<T>(sql, params);
  }
  withTransactionAsync(task: () => Promise<void>): Promise<void> {
    return this.inner.withTransactionAsync(task);
  }
}

class MemKv implements KvStore {
  private readonly map = new Map<string, string>();
  async getItem(key: string, fallback: string): Promise<string | null> {
    return this.map.has(key) ? (this.map.get(key) as string) : fallback;
  }
  async setItem(key: string, value: string): Promise<boolean> {
    this.map.set(key, value);
    return true;
  }
}

interface CountRow {
  n: number;
}

// ===========================================================================
// 1. DB-002 MIGRATION
// ===========================================================================
describe('DB-002 migration', () => {
  it('fresh DB applies DB-001 + DB-002 with tables, indexes, and partial unique', async () => {
    const db = await migratedDb();
    const tables = (
      await db.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table';",
      )
    ).map((r) => r.name);
    expect(tables).toContain('session_state');
    expect(tables).toContain('locked_prediction_entries');

    const indexes = (
      await db.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'index';",
      )
    ).map((r) => r.name);
    expect(indexes).toContain('uq_lpe_valid_target');
    expect(indexes).toContain('idx_lpe_target');

    const migrations = (
      await db.getAllAsync<{ version: string }>('SELECT version FROM schema_migrations;')
    ).map((r) => r.version);
    expect(migrations).toEqual(['DB-001', 'DB-002']);
  });

  it('upgrades an existing DB-001 database to DB-002 without destroying data', async () => {
    const db = await SqlJsDatabase.open();
    for (const s of DB_001_STATEMENTS) await db.execAsync(s);
    await db.execAsync(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL);',
    );
    await db.runAsync('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?);', [
      'DB-001',
      NOW,
    ]);
    await new ShoeRepository(db).insert(makeShoe(SHOE));
    await new RoundRepository(db).append(makeRound(1, Winner.PLAYER));

    await runMigrations(db); // apply DB-002 on top of the existing DB-001 database

    expect((await new ShoeRepository(db).getById(SHOE))?.id).toBe(SHOE);
    expect(await new RoundRepository(db).listByShoe(SHOE)).toHaveLength(1);
    const tables = (
      await db.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'locked_prediction_entries';",
      )
    ).map((r) => r.name);
    expect(tables).toContain('locked_prediction_entries');
    const count = await db.getFirstAsync<CountRow>('SELECT COUNT(*) AS n FROM schema_migrations;');
    expect(count?.n).toBe(2);
  });

  it('is idempotent — running migrations again is a no-op', async () => {
    const db = await migratedDb();
    await runMigrations(db);
    const count = await db.getFirstAsync<CountRow>('SELECT COUNT(*) AS n FROM schema_migrations;');
    expect(count?.n).toBe(2);
  });

  it('foreign key: a locked entry for a missing shoe is rejected', async () => {
    const { db, rounds } = await seededDb(12);
    const started = await new SqliteSessionStore(db).startLive(
      SHOE,
      rounds,
      SessionEnvironment.LIVE_FORWARD,
      { now: NOW },
    );
    const lpe = new LockedPredictionRepository(db);
    // A fully-valid lock, but pointed at a shoe id that does not exist.
    const ghost = { ...started.currentPrediction!, id: 'p-ghost', shoeId: 'ghost' };
    const entry: PredictionEntry = {
      prediction: ghost,
      result: StepResult.PENDING,
      actualWinner: null,
      operatorAction: null,
      invalidated: false,
    };
    await expect(lpe.upsert(entry, { sequenceIndex: 0, now: NOW })).rejects.toThrow();
  });

  it('rollback: a failed DB-002 migration leaves no half-migrated schema', async () => {
    const inner = await SqlJsDatabase.open();
    const faulty = new FaultyDb(inner, 'locked_prediction_entries');
    await expect(runMigrations(faulty)).rejects.toThrow();
    // DB-001 committed; DB-002 rolled back entirely (session_state must NOT exist).
    const tables = (
      await inner.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table';",
      )
    ).map((r) => r.name);
    expect(tables).toContain('shoes');
    expect(tables).not.toContain('session_state');
    expect(tables).not.toContain('locked_prediction_entries');
    const migrations = (
      await inner.getAllAsync<{ version: string }>('SELECT version FROM schema_migrations;')
    ).map((r) => r.version);
    expect(migrations).toEqual(['DB-001']);
  });
});

// ===========================================================================
// 2. DATABASE-ENFORCED UNIQUENESS & LOCK-BEFORE-RESULT
// ===========================================================================
describe('DB-002 session store — invariants', () => {
  it('duplicate valid lock for the same shoe+target is rejected by the DB', async () => {
    const { db, rounds } = await seededDb(12);
    const store = new SqliteSessionStore(db);
    const started = await store.startLive(SHOE, rounds, SessionEnvironment.LIVE_FORWARD, {
      now: NOW,
    });
    const lpe = new LockedPredictionRepository(db);
    const clone = { ...started.currentPrediction!, id: `${started.currentPrediction!.id}-dup` };
    const dup: PredictionEntry = {
      prediction: clone,
      result: StepResult.PENDING,
      actualWinner: null,
      operatorAction: null,
      invalidated: false,
    };
    await expect(lpe.upsert(dup, { sequenceIndex: 99, now: NOW })).rejects.toThrow();
    // still exactly one valid lock for target 13
    expect(await lpe.countValidForTarget(SHOE, 13)).toBe(1);
  });

  it('lock-before-result: if the lock persist fails, nothing is accepted', async () => {
    const { db, rounds } = await seededDb(12);
    const faulty = new FaultyDb(db, 'locked_prediction_entries');
    const store = new SqliteSessionStore(faulty);
    await expect(
      store.startLive(SHOE, rounds, SessionEnvironment.LIVE_FORWARD, { now: NOW }),
    ).rejects.toThrow();
    // No session_state and no lock persisted (transaction rolled back).
    const clean = new SqliteSessionStore(db);
    expect(await clean.reconstruct(SHOE)).toBeNull();
    const count = await db.getFirstAsync<CountRow>(
      'SELECT COUNT(*) AS n FROM locked_prediction_entries WHERE shoe_id = ?;',
      [SHOE],
    );
    expect(count?.n).toBe(0);
  });

  it('lock-before-result: if the result persist fails, the pending lock is untouched', async () => {
    const { db, rounds } = await seededDb(12);
    await new SqliteSessionStore(db).startLive(SHOE, rounds, SessionEnvironment.LIVE_FORWARD, {
      now: NOW,
    });
    const faulty = new FaultyDb(db, 'INSERT INTO rounds');
    const store = new SqliteSessionStore(faulty);
    await expect(
      store.submitResult(SHOE, Winner.BANKER, { now: NOW, operatorAction: OperatorAction.PLAYED }),
    ).rejects.toThrow();
    // No round 13, and target-13 lock still PENDING & valid.
    const clean = await new SqliteSessionStore(db).reconstruct(SHOE);
    expect(clean?.rounds).toHaveLength(12);
    expect(clean?.currentPrediction?.targetRound).toBe(13);
    const entry = clean?.predictions.find((e) => e.prediction.targetRound === 13);
    expect(entry?.result).toBe(StepResult.PENDING);
  });

  it('recovery: reconstruct regenerates + persists a missing pending lock', async () => {
    const { db, rounds } = await seededDb(12);
    await new SqliteSessionStore(db).startLive(SHOE, rounds, SessionEnvironment.LIVE_FORWARD, {
      now: NOW,
    });
    // Simulate a crash that lost the pending lock (but kept session_state).
    await db.runAsync('DELETE FROM locked_prediction_entries WHERE shoe_id = ?;', [SHOE]);
    const store = new SqliteSessionStore(db);
    const recovered = await store.reconstruct(SHOE);
    expect(recovered?.currentPrediction?.targetRound).toBe(13);
    // It was persisted, so a second reconstruct finds exactly one valid lock.
    expect(await new LockedPredictionRepository(db).countValidForTarget(SHOE, 13)).toBe(1);
  });
});

// ===========================================================================
// 3. REVISION LINKAGE
// ===========================================================================
describe('DB-002 session store — revision linkage', () => {
  it('editing history invalidates + links a revision, and old/new locks coexist', async () => {
    const { db, rounds } = await seededDb(12);
    const store = new SqliteSessionStore(db);
    await store.startLive(SHOE, rounds, SessionEnvironment.LIVE_FORWARD, { now: NOW });
    await store.submitResult(SHOE, Winner.BANKER, {
      now: NOW,
      operatorAction: OperatorAction.PLAYED,
    }); // resolve 13 (WIN), lock 14

    const edited = await store.editHistory(
      SHOE,
      13,
      { winner: Winner.PLAYER, playerPair: PairState.NO, bankerPair: PairState.NO },
      { now: '2026-01-02T00:00:00.000Z' },
    );
    const revId = edited.revisions[edited.revisions.length - 1].id;

    // target 13 entry: invalidated, linked to the revision, invalidated_at recorded, payload intact.
    const t13 = await db.getFirstAsync<{
      invalidated: number;
      invalidated_by_revision_id: string | null;
      invalidated_at: string | null;
    }>(
      'SELECT invalidated, invalidated_by_revision_id, invalidated_at FROM locked_prediction_entries WHERE shoe_id = ? AND target_round_number = 13;',
      [SHOE],
    );
    expect(t13?.invalidated).toBe(1);
    expect(t13?.invalidated_by_revision_id).toBe(revId);
    expect(t13?.invalidated_at).toBeTruthy();

    // target 14: an invalidated historical lock AND a new valid lock coexist.
    const t14 = await db.getAllAsync<{ invalidated: number }>(
      'SELECT invalidated FROM locked_prediction_entries WHERE shoe_id = ? AND target_round_number = 14 ORDER BY sequence_index;',
      [SHOE],
    );
    expect(t14.filter((r) => r.invalidated === 0)).toHaveLength(1);
    expect(t14.filter((r) => r.invalidated === 1).length).toBeGreaterThanOrEqual(1);
  });
});

// ===========================================================================
// 4. CRASH / RESTART INVARIANTS (A–G)
// ===========================================================================
describe('DB-002 restart reconstruction', () => {
  const play = { now: NOW, operatorAction: OperatorAction.PLAYED };
  const watch = { now: NOW, operatorAction: OperatorAction.NOT_PLAYED };

  it('A. lock N -> restart -> identical, deeply frozen lock', async () => {
    const { db, rounds } = await seededDb(12);
    const started = await new SqliteSessionStore(db).startLive(
      SHOE,
      rounds,
      SessionEnvironment.LIVE_FORWARD,
      { now: NOW },
    );
    const restored = await new SqliteSessionStore(db).reconstruct(SHOE);
    expect(restored?.currentPrediction).toEqual(started.currentPrediction);
    expect(Object.isFrozen(restored?.currentPrediction)).toBe(true);
    expect(() => {
      (restored!.currentPrediction as { confidence: number }).confidence = 0.01;
    }).toThrow();
    expect(Object.isFrozen(restored?.currentPrediction?.shadow)).toBe(true);
  });

  it('B. lock -> WIN -> restart -> identical evaluation, sequences, paper', async () => {
    const { db, rounds } = await seededDb(12);
    const store = new SqliteSessionStore(db);
    await store.startLive(SHOE, rounds, SessionEnvironment.LIVE_FORWARD, { now: NOW });
    const afterWin = await store.submitResult(SHOE, Winner.BANKER, play);
    const restored = await new SqliteSessionStore(db).reconstruct(SHOE);
    expect(restored?.predictions.find((e) => e.prediction.targetRound === 13)?.result).toBe(
      StepResult.WIN,
    );
    expect(restored?.sequences).toEqual(afterWin.sequences);
    expect(restored?.paper).toEqual(afterWin.paper);
  });

  it('C. WIN, PUSH, WIN, WIN with reconstruction between steps still completes', async () => {
    const { db, rounds } = await seededDb(12);
    await new SqliteSessionStore(db).startLive(SHOE, rounds, SessionEnvironment.LIVE_FORWARD, {
      now: NOW,
    });
    // Each submitResult reconstructs from the DB first (restart between every step).
    await new SqliteSessionStore(db).submitResult(SHOE, Winner.BANKER, play); // eng 1
    await new SqliteSessionStore(db).submitResult(SHOE, Winner.TIE, play); // PUSH (neutral)
    await new SqliteSessionStore(db).submitResult(SHOE, Winner.BANKER, play); // eng 2
    const s3 = await new SqliteSessionStore(db).submitResult(SHOE, Winner.BANKER, play); // eng 3
    expect(s3.sequences.engine[EXP].achieved).toBe(true);
    expect(s3.sequences.engine[EXP].completions).toBe(1);
    const restored = await new SqliteSessionStore(db).reconstruct(SHOE);
    expect(restored?.sequences.engine[EXP].achieved).toBe(true);
  });

  it('D. PLAYED / NOT_PLAYED distinction survives restart', async () => {
    const { db, rounds } = await seededDb(12);
    await new SqliteSessionStore(db).startLive(SHOE, rounds, SessionEnvironment.LIVE_FORWARD, {
      now: NOW,
    });
    await new SqliteSessionStore(db).submitResult(SHOE, Winner.BANKER, watch);
    await new SqliteSessionStore(db).submitResult(SHOE, Winner.BANKER, play);
    const restored = await new SqliteSessionStore(db).reconstruct(SHOE);
    expect(restored?.sequences.engine[EXP].consecutiveWins).toBe(2);
    expect(restored?.sequences.played[EXP].consecutiveWins).toBe(1);
    expect(restored?.paper.wins).toBe(1); // only the PLAYED win is staked
  });

  it('E/G. revision invalidation survives restart; only valid locks are unique per target', async () => {
    const { db, rounds } = await seededDb(12);
    const store = new SqliteSessionStore(db);
    await store.startLive(SHOE, rounds, SessionEnvironment.LIVE_FORWARD, { now: NOW });
    await store.submitResult(SHOE, Winner.BANKER, play);
    await store.editHistory(
      SHOE,
      13,
      { winner: Winner.PLAYER, playerPair: PairState.NO, bankerPair: PairState.NO },
      { now: '2026-01-02T00:00:00.000Z' },
    );
    const restored = await new SqliteSessionStore(db).reconstruct(SHOE);
    const invalidated = restored!.predictions.filter((e) => e.invalidated);
    expect(invalidated.length).toBeGreaterThanOrEqual(1);
    expect(invalidated.every((e) => e.result === StepResult.INVALIDATED)).toBe(true);
    // No two VALID locks share a target round after reconstruction.
    const validTargets = restored!.predictions
      .filter((e) => !e.invalidated)
      .map((e) => e.prediction.targetRound);
    expect(new Set(validTargets).size).toBe(validTargets.length);
  });
});

// ===========================================================================
// 5. WEB ADAPTER PARITY (AsyncStorage-compatible, same contract)
// ===========================================================================
describe('MemorySessionStore (web fallback) — same contract', () => {
  it('start -> WIN -> restart (new store, same kv) preserves evaluation + frozen lock', async () => {
    const kv = new MemKv();
    const rounds = bankerRounds(12);
    const store = new MemorySessionStore(kv);
    await store.startLive(SHOE, rounds, SessionEnvironment.LIVE_FORWARD, { now: NOW });
    const afterWin = await store.submitResult(SHOE, Winner.BANKER, {
      now: NOW,
      operatorAction: OperatorAction.PLAYED,
    });
    const restored = await new MemorySessionStore(kv).reconstruct(SHOE);
    expect(restored?.predictions.find((e) => e.prediction.targetRound === 13)?.result).toBe(
      StepResult.WIN,
    );
    expect(restored?.sequences).toEqual(afterWin.sequences);
    expect(Object.isFrozen(restored?.currentPrediction)).toBe(true);
  });

  it('lock-before-result guard: submitting without a persisted session throws', async () => {
    const store = new MemorySessionStore(new MemKv());
    await expect(store.submitResult(SHOE, Winner.BANKER, { now: NOW })).rejects.toThrow();
  });
});
