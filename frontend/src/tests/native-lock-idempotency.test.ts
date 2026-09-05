/**
 * M7.2 Patch 1 — NATIVE LOCK IDEMPOTENCY / DUPLICATE-LOCK REGRESSION.
 *
 * Reproduces (deterministically, without sleeps) the class of bug that surfaced
 * on Android as:
 *   Call to function 'NativeStatement.finalizeAsync' has been rejected.
 *   Caused by: UNIQUE constraint failed:
 *     locked_prediction_entries.shoe_id, locked_prediction_entries.target_round_number
 *
 * Root cause: a locked prediction's immutable id embeds the lock instant
 * (`pred-<shoe>-r<target>-<now>`), so the SAME (shoe, target) recomputed at two
 * moments (Start-Live double-invoke, reconstruct-recovery re-entry, overlapping
 * submit, retry) yields DIFFERENT ids. The `ON CONFLICT(id)` upsert alone could
 * not dedupe that, so the second INSERT violated the `uq_lpe_valid_target`
 * partial-unique invariant. The persistence path is now idempotent + reconciles
 * the specific unique-lock race, while the DB invariant itself is UNCHANGED.
 *
 * NO decision math / Threshold-Lab / Matcher / schema changes here.
 */
import { RoundSource, SessionEnvironment as ModelEnv, ShoeStatus } from '@/src/domain/models/enums';
import { Winner } from '@/src/domain/models/outcome';
import { PairState } from '@/src/domain/models/pair';
import type { RoundRecord } from '@/src/domain/models/round';
import type { ShoeRecord } from '@/src/domain/models/records';
import { runMigrations } from '@/src/data/database/migrations';
import type { SqlDatabase, SqlParams, SqlRunResult } from '@/src/data/database/sql-database';
import { ShoeRepository } from '@/src/data/repositories/shoe-repository';
import { RoundRepository } from '@/src/data/repositories/round-repository';
import { LockedPredictionRepository } from '@/src/data/repositories/locked-prediction-repository';
import { SqlJsDatabase } from './support/sqljs-database';
import {
  SessionEnvironment,
  StepResult,
  OperatorAction,
  computePrediction,
  type LockedPrediction,
  type PredictionEntry,
} from '@/src/domain/session';
import {
  balancedDecisionConfig,
  DECISION_004_VERSION,
  familyOf,
  ModuleFamily,
} from '@/src/domain/decision';
import {
  MATCH_FINGERPRINT_VERSION,
  fingerprintsForPrefix,
  type HistoricalCandidate,
  type MatcherCorpus,
} from '@/src/domain/matcher';
import { SqliteSessionStore } from '@/src/workflows/session/session-store';

const NOW = '2026-01-01T00:00:00.000Z';
const nowAt = (i: number): string => new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();

const makeShoe = (id: string): ShoeRecord => ({
  id,
  label: null,
  environment: ModelEnv.LIVE_FORWARD,
  status: ShoeStatus.ACTIVE,
  roundCount: 0,
  createdAt: NOW,
  updatedAt: NOW,
});

const makeRound = (shoeId: string, n: number, winner: Winner): RoundRecord => ({
  id: `${shoeId}-r${n}`,
  shoeId,
  roundNumber: n,
  winner,
  playerPair: PairState.UNKNOWN,
  bankerPair: PairState.UNKNOWN,
  source: RoundSource.HISTORY,
  createdAt: NOW,
});

async function migratedDb(): Promise<SqlDatabase> {
  const db = await SqlJsDatabase.open();
  await runMigrations(db);
  return db;
}

/** Fresh migrated DB with a shoe + `n` banker rounds. */
async function seeded(shoeId: string, n = 12): Promise<{ db: SqlDatabase; rounds: RoundRecord[] }> {
  const db = await migratedDb();
  await new ShoeRepository(db).insert(makeShoe(shoeId));
  const rounds = Array.from({ length: n }, (_, i) => makeRound(shoeId, i + 1, Winner.BANKER));
  const roundRepo = new RoundRepository(db);
  for (const r of rounds) await roundRepo.append(r);
  return { db, rounds };
}

const entryOf = (p: LockedPrediction): PredictionEntry => ({
  prediction: p,
  result: StepResult.PENDING,
  actualWinner: null,
  operatorAction: null,
  invalidated: false,
});

/** Eligible controlled corpus whose exact fingerprints produce a directional signal. */
function directionalCorpus(rounds: readonly RoundRecord[], continuation: Winner): MatcherCorpus {
  const candidates: HistoricalCandidate[] = [];
  for (const fingerprint of fingerprintsForPrefix(rounds).values()) {
    for (let copy = 0; copy < 10; copy += 1) {
      candidates.push({
        sourceShoeId: `recovery-${continuation}-${fingerprint.window}-${copy}`,
        endpoint: rounds.length,
        continuation,
        window: fingerprint.window,
        fingerprint,
        fingerprintVersion: MATCH_FINGERPRINT_VERSION,
      });
    }
  }
  return { completedShoes: 100, nonTieRounds: 5000, eligible: true, candidates };
}

const abstainCorpus = (): MatcherCorpus => ({
  completedShoes: 100,
  nonTieRounds: 5000,
  eligible: true,
  candidates: [],
});

/** Wrapper that throws a NON-constraint error for statements matching `failOn`. */
class GenericFaultDb implements SqlDatabase {
  constructor(
    private readonly inner: SqlDatabase,
    private readonly failOn: string,
  ) {}
  execAsync(sql: string): Promise<void> {
    return this.inner.execAsync(sql);
  }
  async runAsync(sql: string, params: SqlParams = []): Promise<SqlRunResult> {
    if (sql.includes(this.failOn)) throw new Error('disk I/O error (simulated, unrelated)');
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

/**
 * Repository whose `findValidLockId` returns null on its FIRST call only —
 * deterministically simulating the check-then-insert race window where the
 * pre-check misses a concurrently-committed lock, so the INSERT itself hits the
 * `uq_lpe_valid_target` conflict and the catch-path must reconcile.
 */
class RacyRepo extends LockedPredictionRepository {
  private missedFirst = false;
  async findValidLockId(shoeId: string, targetRound: number): Promise<string | null> {
    if (!this.missedFirst) {
      this.missedFirst = true;
      return null; // stale pre-check read
    }
    return super.findValidLockId(shoeId, targetRound);
  }
}

// ===========================================================================
// SECTION 12 — IDEMPOTENCY (A–F)
// ===========================================================================
describe('M7.2 lock idempotency — repository', () => {
  it('A: identical re-persist of the same lock keeps exactly one valid entry', async () => {
    const { db, rounds } = await seeded('s1', 12);
    const store = new SqliteSessionStore(db);
    const started = await store.startLive('s1', rounds, SessionEnvironment.LIVE_FORWARD, { now: NOW });
    const lpe = new LockedPredictionRepository(db);
    const entry = started.predictions.find((e) => e.prediction.targetRound === 13)!;
    const out = await lpe.upsert(entry, { sequenceIndex: 0, now: NOW });
    expect(out.canonicalId).toBe(entry.prediction.id);
    expect(await lpe.countValidForTarget('s1', 13)).toBe(1);
  });

  it('B: a RECOMPUTED candidate (different id) reuses the persisted authoritative lock', async () => {
    const { db, rounds } = await seeded('s1', 12);
    const store = new SqliteSessionStore(db);
    const started = await store.startLive('s1', rounds, SessionEnvironment.LIVE_FORWARD, {
      now: NOW,
      profile: 'BALANCED',
      balancedConfig: balancedDecisionConfig(0.54),
    });
    const originalId = started.currentPrediction!.id;
    const lpe = new LockedPredictionRepository(db);
    const payloadBefore = (
      await db.getFirstAsync<{ payload: string }>(
        'SELECT payload FROM locked_prediction_entries WHERE id = ?;',
        [originalId],
      )
    )!.payload;

    // Recompute the SAME target at a later instant => different id.
    const recomputed = computePrediction(rounds, SessionEnvironment.LIVE_FORWARD, 's1', {
      now: nowAt(5),
      historyConfirmed: true,
      profile: 'BALANCED',
      balancedConfig: balancedDecisionConfig(0.54),
    });
    expect(recomputed.id).not.toBe(originalId);
    expect(recomputed.targetRound).toBe(13);

    const out = await lpe.upsert(entryOf(recomputed), { sequenceIndex: 1, now: nowAt(5) });
    expect(out).toEqual({ canonicalId: originalId, reconciled: true });
    expect(await lpe.countValidForTarget('s1', 13)).toBe(1);
    expect(await lpe.findValidLockId('s1', 13)).toBe(originalId);
    // IMMUTABILITY (Section 15): the persisted payload (decision/side/confidence/
    // decisionConfigVersion/BALCFG threshold/profileComparison/matcherAudit) is
    // byte-identical — reconciliation NEVER rewrites the authoritative lock.
    const payloadAfter = (
      await db.getFirstAsync<{ payload: string }>(
        'SELECT payload FROM locked_prediction_entries WHERE id = ?;',
        [originalId],
      )
    )!.payload;
    expect(payloadAfter).toBe(payloadBefore);
  });

  it('C: check-then-insert race hits UNIQUE then reconciles (no fatal error)', async () => {
    const { db, rounds } = await seeded('s1', 12);
    const store = new SqliteSessionStore(db);
    const started = await store.startLive('s1', rounds, SessionEnvironment.LIVE_FORWARD, { now: NOW });
    const originalId = started.currentPrediction!.id;

    const racy = new RacyRepo(db);
    const contender = computePrediction(rounds, SessionEnvironment.LIVE_FORWARD, 's1', {
      now: nowAt(9),
      historyConfirmed: true,
    });
    // Pre-check is stubbed to miss => INSERT is attempted => UNIQUE conflict =>
    // caught and reconciled by re-reading the winner. Must NOT throw.
    const out = await racy.upsert(entryOf(contender), { sequenceIndex: 2, now: nowAt(9) });
    expect(out).toEqual({ canonicalId: originalId, reconciled: true });
    expect(await new LockedPredictionRepository(db).countValidForTarget('s1', 13)).toBe(1);
  });

  it('D: unrelated SQLite errors STILL propagate (never swallowed)', async () => {
    const { db, rounds } = await seeded('s1', 12);
    const started = await new SqliteSessionStore(db).startLive(
      's1',
      rounds,
      SessionEnvironment.LIVE_FORWARD,
      { now: NOW },
    );
    // (i) Foreign-key violation on a ghost shoe is NOT a target-unique conflict.
    const ghost = { ...started.currentPrediction!, id: 'p-ghost', shoeId: 'ghost', targetRound: 99 };
    await expect(
      new LockedPredictionRepository(db).upsert(entryOf(ghost), { sequenceIndex: 0, now: NOW }),
    ).rejects.toThrow();
    // (ii) A generic (non-constraint) driver error must propagate unchanged.
    // Use a NEW target (14) with no existing lock, so the pre-check does not
    // reconcile and the fault-injected INSERT is actually reached.
    const nextRounds = [...rounds, makeRound('s1', 13, Winner.BANKER)];
    const faulty = new GenericFaultDb(db, 'INSERT INTO locked_prediction_entries');
    const fresh = computePrediction(nextRounds, SessionEnvironment.LIVE_FORWARD, 's1', {
      now: nowAt(3),
      historyConfirmed: true,
    });
    expect(fresh.targetRound).toBe(14);
    await expect(
      new LockedPredictionRepository(faulty).upsert(entryOf(fresh), { sequenceIndex: 1, now: nowAt(3) }),
    ).rejects.toThrow(/disk I\/O error/i);
    void started;
  });

  it('E: a DIFFERENT target inserts normally alongside the existing lock', async () => {
    const { db, rounds } = await seeded('s1', 12);
    await new SqliteSessionStore(db).startLive('s1', rounds, SessionEnvironment.LIVE_FORWARD, { now: NOW });
    const lpe = new LockedPredictionRepository(db);
    // A lock for target 14 (rounds + one more) — different target, normal insert.
    const nextRounds = [...rounds, makeRound('s1', 13, Winner.BANKER)];
    const lock14 = computePrediction(nextRounds, SessionEnvironment.LIVE_FORWARD, 's1', {
      now: nowAt(2),
      historyConfirmed: true,
    });
    expect(lock14.targetRound).toBe(14);
    const out = await lpe.upsert(entryOf(lock14), { sequenceIndex: 1, now: nowAt(2) });
    expect(out.reconciled).toBe(false);
    expect(await lpe.countValidForTarget('s1', 13)).toBe(1);
    expect(await lpe.countValidForTarget('s1', 14)).toBe(1);
  });

  it('F: the SAME target on a DIFFERENT shoe inserts normally', async () => {
    const db = await migratedDb();
    await new ShoeRepository(db).insert(makeShoe('sA'));
    await new ShoeRepository(db).insert(makeShoe('sB'));
    const roundRepo = new RoundRepository(db);
    const rA = Array.from({ length: 12 }, (_, i) => makeRound('sA', i + 1, Winner.BANKER));
    const rB = Array.from({ length: 12 }, (_, i) => makeRound('sB', i + 1, Winner.BANKER));
    for (const r of [...rA, ...rB]) await roundRepo.append(r);
    const store = new SqliteSessionStore(db);
    await store.startLive('sA', rA, SessionEnvironment.LIVE_FORWARD, { now: NOW });
    await store.startLive('sB', rB, SessionEnvironment.LIVE_FORWARD, { now: NOW });
    const lpe = new LockedPredictionRepository(db);
    expect(await lpe.countValidForTarget('sA', 13)).toBe(1);
    expect(await lpe.countValidForTarget('sB', 13)).toBe(1);
  });
});

// ===========================================================================
// SECTION 5/6 — ORCHESTRATION: Start-Live double-invoke + recovery re-entry
// ===========================================================================
describe('M7.2 lock idempotency — orchestration re-entry', () => {
  it('Start-Live invoked twice (different instants) never creates a duplicate lock', async () => {
    const { db, rounds } = await seeded('s1', 12);
    const store = new SqliteSessionStore(db);
    const a = await store.startLive('s1', rounds, SessionEnvironment.LIVE_FORWARD, { now: NOW });
    // Simulate a React effect re-run / rapid Start-Live: a SECOND startLive at a
    // later instant recomputes the first lock with a new id — must reconcile.
    const b = await store.startLive('s1', rounds, SessionEnvironment.LIVE_FORWARD, { now: nowAt(7) });
    expect(a.currentPrediction!.targetRound).toBe(13);
    expect(b.currentPrediction!.targetRound).toBe(13);
    const lpe = new LockedPredictionRepository(db);
    expect(await lpe.countValidForTarget('s1', 13)).toBe(1);
    // total rows for the shoe (valid + any) is exactly one (no orphan insert).
    const total = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM locked_prediction_entries WHERE shoe_id = ?;',
      ['s1'],
    );
    expect(total?.n).toBe(1);
  });

  it('recovery re-entry (lost pending lock) reconstructed twice keeps one valid lock', async () => {
    const { db, rounds } = await seeded('s1', 12);
    await new SqliteSessionStore(db).startLive('s1', rounds, SessionEnvironment.LIVE_FORWARD, { now: NOW });
    // Crash lost the pending lock but kept session_state.
    await db.runAsync('DELETE FROM locked_prediction_entries WHERE shoe_id = ?;', ['s1']);
    const store = new SqliteSessionStore(db);
    const r1 = await store.reconstruct('s1');
    const r2 = await store.reconstruct('s1');
    expect(r1?.currentPrediction?.targetRound).toBe(13);
    expect(r2?.currentPrediction?.targetRound).toBe(13);
    // Second reconstruct did NOT reinsert / duplicate.
    expect(await new LockedPredictionRepository(db).countValidForTarget('s1', 13)).toBe(1);
    // The returned state reflects the AUTHORITATIVE persisted lock.
    expect(r2?.currentPrediction?.id).toBe(await new LockedPredictionRepository(db).findValidLockId('s1', 13));
  });
});

// ===========================================================================
// SECTION 13 — RESTART / RECOVERY under STRICT and BALANCED / DECISION-004
// ===========================================================================
describe('M7.2 lock idempotency — restart immutability', () => {
  it('STRICT: pending lock round-trips byte-identical across reconstruct (no reinsert)', async () => {
    const { db, rounds } = await seeded('s1', 12);
    const store = new SqliteSessionStore(db);
    const started = await store.startLive('s1', rounds, SessionEnvironment.LIVE_FORWARD, {
      now: NOW,
      profile: 'STRICT',
    });
    const before = JSON.stringify(started.currentPrediction);
    const again = await store.reconstruct('s1'); // pending exists => NO recovery
    expect(JSON.stringify(again!.currentPrediction)).toBe(before);
    expect(await new LockedPredictionRepository(db).countValidForTarget('s1', 13)).toBe(1);
  });

  it('BALANCED / DECISION-004 / BALCFG-001: threshold + payload survive restart, one valid lock', async () => {
    const { db, rounds } = await seeded('s1', 12);
    const store = new SqliteSessionStore(db);
    const started = await store.startLive('s1', rounds, SessionEnvironment.LIVE_FORWARD, {
      now: NOW,
      profile: 'BALANCED',
      balancedConfig: balancedDecisionConfig(0.53),
    });
    const p0 = started.currentPrediction as LockedPrediction & {
      balancedThreshold?: number;
      decisionConfigVersion?: string;
    };
    expect(p0.decisionConfigVersion).toBe(DECISION_004_VERSION);
    expect(p0.balancedThreshold).toBe(0.53);
    const before = JSON.stringify(started.currentPrediction);

    // Lose the pending lock, then RECOVER — the regenerated lock must carry the
    // shoe's immutable BALCFG-001 threshold (recovered from... nothing left, so
    // start over via a fresh reconstruct after restoring the lock).
    const againNoLoss = await store.reconstruct('s1');
    expect(JSON.stringify(againNoLoss!.currentPrediction)).toBe(before);
    expect(await new LockedPredictionRepository(db).countValidForTarget('s1', 13)).toBe(1);
  });

  it('recovery regeneration recovers the BALCFG-001 threshold from surviving locks', async () => {
    const { db, rounds } = await seeded('s1', 12);
    const store = new SqliteSessionStore(db);
    // Start under BALANCED @0.52, submit one result so a RESOLVED valid lock (with
    // BALCFG) survives, then lose only the NEW pending lock and recover it.
    await store.startLive('s1', rounds, SessionEnvironment.LIVE_FORWARD, {
      now: NOW,
      profile: 'BALANCED',
      balancedConfig: balancedDecisionConfig(0.52),
    });
    const afterSubmit = await store.submitResult('s1', Winner.BANKER, {
      now: nowAt(1),
      operatorAction: OperatorAction.PLAYED,
      profile: 'BALANCED',
      balancedConfig: balancedDecisionConfig(0.52),
    });
    const pendingTarget = afterSubmit.currentPrediction!.targetRound; // 14
    // Drop ONLY the pending lock for target 14.
    await db.runAsync(
      'DELETE FROM locked_prediction_entries WHERE shoe_id = ? AND target_round_number = ? AND invalidated = 0;',
      ['s1', pendingTarget],
    );
    const recovered = await store.reconstruct('s1', { profile: 'BALANCED' });
    const rp = recovered!.currentPrediction as LockedPrediction & {
      balancedThreshold?: number;
      balancedConfigVersion?: string;
      decisionConfigVersion?: string;
    };
    expect(rp.targetRound).toBe(pendingTarget);
    expect(rp.profileComparison?.selectedProfile).toBe('BALANCED');
    // Recovery preserves the shoe's immutable BALCFG-001 threshold from the
    // surviving valid locks rather than consulting the next-shoe preference.
    expect(rp.balancedConfigVersion).toBe('BALCFG-001');
    expect(rp.balancedThreshold).toBe(0.52);
    expect(await new LockedPredictionRepository(db).countValidForTarget('s1', pendingTarget)).toBe(1);
  });

  it('directional recovery is semantically equivalent to a normal production lock', async () => {
    const { db, rounds } = await seeded('s1', 12);
    const store = new SqliteSessionStore(db);
    await store.startLive('s1', rounds, SessionEnvironment.LIVE_FORWARD, {
      now: NOW,
      profile: 'BALANCED',
      matcherCorpus: directionalCorpus(rounds, Winner.PLAYER),
      balancedConfig: balancedDecisionConfig(0.52),
    });

    const nextRounds = [...rounds, makeRound('s1', 13, Winner.BANKER)];
    const corpus = directionalCorpus(nextRounds, Winner.PLAYER);
    const normalState = await store.submitResult('s1', Winner.BANKER, {
      now: nowAt(1),
      operatorAction: OperatorAction.NOT_PLAYED,
      profile: 'BALANCED',
      matcherCorpus: corpus,
      balancedConfig: balancedDecisionConfig(0.52),
    });
    const normal = normalState.currentPrediction!;
    await db.runAsync(
      'DELETE FROM locked_prediction_entries WHERE shoe_id = ? AND target_round_number = ? AND invalidated = 0;',
      ['s1', normal.targetRound],
    );

    const recovered = (await store.reconstruct('s1', {
      profile: 'BALANCED',
      matcherCorpus: corpus,
    }))!.currentPrediction!;
    const fields = (p: LockedPrediction) => ({
      decision: p.decision,
      side: p.side,
      confidence: p.confidence,
      playerScore: p.playerScore,
      bankerScore: p.bankerScore,
      category: p.category,
      matcherAudit: p.matcherAudit,
      selectedProfile: p.profileComparison?.selectedProfile,
      decisionConfigVersion: p.decisionConfigVersion,
      balancedConfigVersion: p.balancedConfigVersion,
      balancedThreshold: p.balancedThreshold,
      engineVersion: p.engineVersion,
    });
    expect(fields(recovered)).toEqual(fields(normal));
    expect(recovered.matcherAudit?.signal).toBe('PLAYER');
    const active = recovered.moduleResults.filter(
      (module) => module.moduleId === 'historical-matcher' && module.status === 'ACTIVE',
    );
    expect(active).toHaveLength(1);
    expect(active[0].reliability).toBe(0.3);
    expect(familyOf(active[0].moduleId)).toBe(ModuleFamily.HISTORICAL);
    expect(await new LockedPredictionRepository(db).countValidForTarget('s1', normal.targetRound)).toBe(1);
  });

  it('ABSTAIN recovery persists its audit and contributes no active matcher module', async () => {
    const { db, rounds } = await seeded('s1', 12);
    const store = new SqliteSessionStore(db);
    await store.startLive('s1', rounds, SessionEnvironment.LIVE_FORWARD, {
      now: NOW,
      profile: 'BALANCED',
      matcherCorpus: abstainCorpus(),
    });
    await db.runAsync('DELETE FROM locked_prediction_entries WHERE shoe_id = ?;', ['s1']);
    const recovered = (await store.reconstruct('s1', {
      profile: 'BALANCED',
      matcherCorpus: abstainCorpus(),
    }))!.currentPrediction!;
    expect(recovered.matcherAudit?.signal).toBe('ABSTAIN');
    expect(
      recovered.moduleResults.filter(
        (module) => module.moduleId === 'historical-matcher' && module.status === 'ACTIVE',
      ),
    ).toHaveLength(0);
  });

  it('submitResult passes matcher context into its internal missing-lock recovery', async () => {
    const { db, rounds } = await seeded('s1', 12);
    const store = new SqliteSessionStore(db);
    await store.startLive('s1', rounds, SessionEnvironment.LIVE_FORWARD, {
      now: NOW,
      profile: 'BALANCED',
      balancedConfig: balancedDecisionConfig(0.53),
    });
    const afterFirst = await store.submitResult('s1', Winner.BANKER, {
      now: nowAt(1),
      operatorAction: OperatorAction.NOT_PLAYED,
      profile: 'BALANCED',
      balancedConfig: balancedDecisionConfig(0.53),
    });
    const lostTarget = afterFirst.currentPrediction!.targetRound;
    const corpus = directionalCorpus(afterFirst.rounds, Winner.BANKER);
    await db.runAsync(
      'DELETE FROM locked_prediction_entries WHERE shoe_id = ? AND target_round_number = ? AND invalidated = 0;',
      ['s1', lostTarget],
    );

    const submitted = await store.submitResult('s1', Winner.PLAYER, {
      now: nowAt(2),
      operatorAction: OperatorAction.NOT_PLAYED,
      profile: 'BALANCED',
      matcherCorpus: corpus,
      balancedConfig: balancedDecisionConfig(0.53),
    });
    const repairedAndResolved = submitted.predictions.find(
      (entry) => entry.prediction.targetRound === lostTarget && !entry.invalidated,
    )!.prediction;
    expect(repairedAndResolved.matcherAudit?.signal).toBe('BANKER');
    expect(
      repairedAndResolved.moduleResults.filter(
        (module) => module.moduleId === 'historical-matcher' && module.status === 'ACTIVE',
      ),
    ).toHaveLength(1);
    expect(repairedAndResolved.balancedThreshold).toBe(0.53);
  });
});

// ===========================================================================
// SECTION 11 / 14 — LONG SEQUENTIAL LIVE FLOW (no hard round limit, no dup)
// ===========================================================================
describe('M7.2 lock idempotency — long live flow', () => {
  it('40 sequential submits: one valid lock per target, correct progression, NO round limit', async () => {
    const { db, rounds } = await seeded('s1', 12);
    const store = new SqliteSessionStore(db);
    await store.startLive('s1', rounds, SessionEnvironment.LIVE_FORWARD, { now: NOW });
    const lpe = new LockedPredictionRepository(db);

    const TOTAL = 40;
    for (let i = 0; i < TOTAL; i += 1) {
      const target = 13 + i; // the target being resolved this step
      expect(await lpe.countValidForTarget('s1', target)).toBe(1);
      const state = await store.submitResult('s1', Winner.BANKER, {
        now: nowAt(i + 1),
        operatorAction: i % 2 === 0 ? OperatorAction.PLAYED : OperatorAction.NOT_PLAYED,
      });
      // A fresh pending lock for the next target exists (well past ~27/30 rounds).
      expect(state.currentPrediction!.targetRound).toBe(target + 1);
      expect(await lpe.countValidForTarget('s1', target + 1)).toBe(1);
    }

    const final = await store.reconstruct('s1');
    expect(final!.rounds).toHaveLength(12 + TOTAL);
    // No target ever accumulated a duplicate valid lock.
    const dupes = await db.getAllAsync<{ target_round_number: number; n: number }>(
      `SELECT target_round_number, COUNT(*) AS n FROM locked_prediction_entries
         WHERE shoe_id = ? AND invalidated = 0 GROUP BY target_round_number HAVING n > 1;`,
      ['s1'],
    );
    expect(dupes).toHaveLength(0);
  });
});
