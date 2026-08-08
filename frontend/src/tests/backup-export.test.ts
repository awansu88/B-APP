/**
 * Milestone 6 — export / validate / import-merge tests.
 * Pure format+validation+merge rules, plus sql.js checks for zero-write
 * validation, transactional merge apply, and rollback.
 */
import { SqlJsDatabase } from './support/sqljs-database';
import { runMigrations } from '@/src/data/database/migrations';
import { loadDataset, applyMerge } from '@/src/data/backup';
import {
  buildExport,
  planMerge,
  serializeExport,
  validateExport,
  type BappDataset,
  type LockedPredictionEntryRecord,
} from '@/src/domain/backup';
import type { MergePlan } from '@/src/domain/backup/merge';
import type { RoundRecord } from '@/src/domain/models/round';
import type { RevisionRecord, ShoeRecord } from '@/src/domain/models/records';

const shoe = (id: string, label: string | null = null): ShoeRecord => ({
  id, label, environment: 'LIVE_FORWARD' as ShoeRecord['environment'],
  status: 'ACTIVE' as ShoeRecord['status'], roundCount: 0, createdAt: 't', updatedAt: 't',
});
const round = (id: string, shoeId: string, n: number, winner = 'PLAYER'): RoundRecord => ({
  id, shoeId, roundNumber: n, winner: winner as RoundRecord['winner'],
  playerPair: 'UNKNOWN' as RoundRecord['playerPair'], bankerPair: 'UNKNOWN' as RoundRecord['bankerPair'],
  source: 'LIVE' as RoundRecord['source'], createdAt: 't',
});
const revision = (id: string, shoeId: string): RevisionRecord => ({
  id, shoeId, roundNumber: 1, action: 'INSERT', before: null, after: '{}', createdAt: 't',
});
const lpe = (
  id: string, shoeId: string, target: number, over: Partial<LockedPredictionEntryRecord> = {},
): LockedPredictionEntryRecord => ({
  id, shoeId, targetRoundNumber: target, sequenceIndex: target - 1, status: 'EVALUATED',
  decision: 'BET_PLAYER', side: 'PLAYER', confidence: 0.6, category: 'QUALIFIED',
  operatorAction: 'PLAYED', evaluation: 'WIN', actualWinner: 'PLAYER', invalidated: false,
  invalidatedByRevisionId: null, invalidatedAt: null, lockedAt: 't', evaluatedAt: 't',
  payloadVersion: 'SESSION-001', payload: '{"id":"' + id + '"}', createdAt: 't', ...over,
});

const sampleDataset = (): BappDataset => ({
  shoes: [shoe('S1')],
  rounds: [round('r1', 'S1', 1, 'PLAYER'), round('r2', 'S1', 2, 'BANKER')],
  revisions: [revision('v1', 'S1')],
  lockedPredictions: [
    lpe('p1', 'S1', 1, { evaluation: 'WIN' }),
    lpe('p2', 'S1', 2, { evaluation: 'INVALIDATED', invalidated: true }),
  ],
  sessionStates: [{
    shoeId: 'S1', sessionVersion: 'SESSION-001', workflow: 'WAITING_FOR_RESULT',
    environment: 'LIVE_FORWARD', currentTargetRound: 3, paperUnitsStaked: 1, paperNetUnits: 1,
    paperWins: 1, paperLosses: 0, paperPushes: 0, createdAt: 't', updatedAt: 't',
  }],
});

const opts = { source: 'native-sqlite' as const, now: '2025-01-01T00:00:00.000Z' };

describe('export format', () => {
  it('FULL_BACKUP includes every collection with metadata + counts', () => {
    const exp = buildExport(sampleDataset(), { kind: 'FULL_BACKUP', ...opts });
    expect(exp.meta.format).toBe('BAPP-EXPORT');
    expect(exp.meta.formatVersion).toBe('EXPORT-001');
    expect(exp.meta.schemaVersion).toBe('DB-002');
    expect(exp.meta.kind).toBe('FULL_BACKUP');
    expect(exp.meta.counts).toEqual({ shoes: 1, rounds: 2, revisions: 1, lockedPredictions: 2, sessionStates: 1 });
    expect(exp.data.sessionStates).toHaveLength(1);
    expect(typeof serializeExport(exp)).toBe('string');
  });

  it('HISTORY export omits predictions + session states', () => {
    const exp = buildExport(sampleDataset(), { kind: 'HISTORY', ...opts });
    expect(exp.data.lockedPredictions).toHaveLength(0);
    expect(exp.data.sessionStates).toHaveLength(0);
    expect(exp.data.rounds).toHaveLength(2);
  });

  it('ANALYSIS export carries locked predictions + shoes only', () => {
    const exp = buildExport(sampleDataset(), { kind: 'ANALYSIS', ...opts });
    expect(exp.data.lockedPredictions).toHaveLength(2);
    expect(exp.data.rounds).toHaveLength(0);
    expect(exp.data.shoes).toHaveLength(1);
  });
});

describe('export validation (zero writes)', () => {
  it('accepts a well-formed FULL_BACKUP', () => {
    const exp = buildExport(sampleDataset(), { kind: 'FULL_BACKUP', ...opts });
    const result = validateExport(JSON.parse(serializeExport(exp)));
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects a malformed (non B-APP) object', () => {
    const r = validateExport({ hello: 'world' });
    expect(r.ok).toBe(false);
    expect(r.errors[0].code).toBe('MALFORMED');
  });

  it('rejects an unsupported export version', () => {
    const exp = buildExport(sampleDataset(), { kind: 'FULL_BACKUP', ...opts });
    const bad = { ...exp, meta: { ...exp.meta, formatVersion: 'EXPORT-999' } };
    const r = validateExport(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === 'UNSUPPORTED_VERSION')).toBe(true);
  });

  it('rejects an invalid enum value', () => {
    const ds = sampleDataset();
    const bad = buildExport({ ...ds, rounds: [{ ...ds.rounds[0], winner: 'XX' as RoundRecord['winner'] }] }, { kind: 'HISTORY', ...opts });
    const r = validateExport(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === 'BAD_ENUM')).toBe(true);
  });

  it('rejects an invalid foreign key (orphan round)', () => {
    const ds = sampleDataset();
    const bad = buildExport({ ...ds, rounds: [round('rX', 'NOPE', 1)] }, { kind: 'HISTORY', ...opts });
    const r = validateExport(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === 'ORPHAN_ROUND')).toBe(true);
  });

  it('rejects duplicate valid locked prediction for the same shoe + target', () => {
    const ds: BappDataset = {
      ...sampleDataset(),
      lockedPredictions: [lpe('p1', 'S1', 1), lpe('p1b', 'S1', 1)],
    };
    const bad = buildExport(ds, { kind: 'ANALYSIS', ...opts });
    const r = validateExport(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === 'DUP_VALID_LOCK')).toBe(true);
  });
});

describe('import merge planning (pure)', () => {
  it('skips identical duplicates', () => {
    const ds = sampleDataset();
    const exp = buildExport(ds, { kind: 'FULL_BACKUP', ...opts });
    const plan = planMerge(ds, exp);
    expect(plan.safe).toBe(true);
    expect(plan.report.duplicatesSkipped).toBeGreaterThan(0);
    expect(plan.report.shoesAdded).toBe(0);
    expect(plan.report.roundsAdded).toBe(0);
  });

  it('flags a same-id / different-content conflict', () => {
    const ds = sampleDataset();
    const incoming = buildExport({ ...ds, shoes: [shoe('S1', 'RENAMED')] }, { kind: 'HISTORY', ...opts });
    const plan = planMerge(ds, incoming);
    expect(plan.safe).toBe(false);
    expect(plan.report.conflicts.some((c) => c.collection === 'shoes')).toBe(true);
  });

  it('imports two independent shoes normally', () => {
    const existing = sampleDataset();
    const incoming = buildExport(
      { shoes: [shoe('S2')], rounds: [round('r9', 'S2', 1)], revisions: [], lockedPredictions: [], sessionStates: [] },
      { kind: 'HISTORY', ...opts },
    );
    const plan = planMerge(existing, incoming);
    expect(plan.safe).toBe(true);
    expect(plan.report.shoesAdded).toBe(1);
    expect(plan.report.roundsAdded).toBe(1);
  });

  it('rejects an incoming valid lock colliding with an existing valid lock', () => {
    const existing = sampleDataset(); // has valid p1 for S1::1
    const incoming = buildExport(
      { shoes: [shoe('S1')], rounds: [], revisions: [], lockedPredictions: [lpe('pOther', 'S1', 1)], sessionStates: [] },
      { kind: 'ANALYSIS', ...opts },
    );
    const plan = planMerge(existing, incoming);
    expect(plan.safe).toBe(false);
    expect(plan.report.conflicts.some((c) => c.collection === 'lockedPredictions')).toBe(true);
  });
});

// -- helpers to seed a real sql.js DB from a dataset (via a FULL restore path) --
async function freshDb(): Promise<SqlJsDatabase> {
  const db = await SqlJsDatabase.open();
  await runMigrations(db);
  return db;
}
async function seedShoe(db: SqlJsDatabase, s: ShoeRecord): Promise<void> {
  await db.runAsync(
    'INSERT INTO shoes (id,label,environment,status,round_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?);',
    [s.id, s.label, s.environment, s.status, s.roundCount, s.createdAt, s.updatedAt],
  );
}

describe('import merge apply (sql.js, transactional)', () => {
  it('validate performs zero DB writes', async () => {
    const db = await freshDb();
    await seedShoe(db, shoe('S1'));
    const before = await loadDataset(db);
    validateExport(buildExport(sampleDataset(), { kind: 'FULL_BACKUP', ...opts }));
    const after = await loadDataset(db);
    expect(after).toEqual(before);
  });

  it('applies a safe independent-shoe merge', async () => {
    const db = await freshDb();
    await seedShoe(db, shoe('S1'));
    const existing = await loadDataset(db);
    const incoming = buildExport(
      { shoes: [shoe('S2')], rounds: [round('r9', 'S2', 1)], revisions: [], lockedPredictions: [], sessionStates: [] },
      { kind: 'HISTORY', ...opts },
    );
    const plan = planMerge(existing, incoming);
    await applyMerge(db, plan);
    const after = await loadDataset(db);
    expect(after.shoes.map((s) => s.id).sort()).toEqual(['S1', 'S2']);
    expect(after.rounds).toHaveLength(1);
  });

  it('refuses to apply an unsafe (conflicting) plan', async () => {
    const db = await freshDb();
    await seedShoe(db, shoe('S1'));
    const existing = await loadDataset(db);
    const incoming = buildExport({ shoes: [shoe('S1', 'RENAMED')], rounds: [], revisions: [], lockedPredictions: [], sessionStates: [] }, { kind: 'HISTORY', ...opts });
    const plan = planMerge(existing, incoming);
    await expect(applyMerge(db, plan)).rejects.toThrow();
  });

  it('rolls back a failing merge apply (no partial dataset)', async () => {
    const db = await freshDb();
    await seedShoe(db, shoe('S1'));
    const before = await loadDataset(db);
    // Hand-crafted plan marked safe but with a duplicate PK to force a mid-tx failure.
    const badPlan: MergePlan = {
      toAdd: { shoes: [shoe('S2'), shoe('S2')], rounds: [], revisions: [], lockedPredictions: [], sessionStates: [] },
      report: {
        shoesRead: 2, shoesAdded: 2, roundsRead: 0, roundsAdded: 0, revisionsRead: 0, revisionsAdded: 0,
        predictionsRead: 0, predictionsAdded: 0, sessionStatesRead: 0, sessionStatesAdded: 0,
        duplicatesSkipped: 0, conflicts: [], invalidRecords: [],
      },
      safe: true,
    };
    await expect(applyMerge(db, badPlan)).rejects.toThrow();
    const after = await loadDataset(db);
    expect(after).toEqual(before);
  });
});
