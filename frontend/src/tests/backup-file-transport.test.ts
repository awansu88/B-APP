/**
 * M7.2 Patch 2 — FILE TRANSPORT + IMPORT VIEW-MODEL + MODERN-PAYLOAD tests.
 *
 * Pure/deterministic (no Android filesystem). Proves the portable EXPORT-001
 * file body round-trips, malformed/invalid files are rejected zero-write, the
 * import summary counts are correct, the import view-model states are correct,
 * modern DECISION-004 / BALCFG-001 / matcherAudit / profileComparison payloads
 * survive byte-identical, and file-path Merge/Restore keep the unique-lock
 * invariant + persist across restart.
 */
import { SqlJsDatabase } from './support/sqljs-database';
import { runMigrations } from '@/src/data/database/migrations';
import { loadDataset, applyMerge, restoreBackup } from '@/src/data/backup';
import {
  buildExport,
  serializeExport,
  validateExport,
  planMerge,
  inspectImport,
  exportFileName,
  rawSqliteFileName,
  fileStamp,
  isCurrentExportVersion,
  BAPP_BACKUP_EXTENSION,
  type BappDataset,
  type BappExport,
  type LockedPredictionEntryRecord,
} from '@/src/domain/backup';
import { deriveImportView, idleImportView } from '@/src/workflows/backup/import-view-model';

// --- pure dataset fixtures --------------------------------------------------
const MODERN_PAYLOAD = JSON.stringify({
  id: 'p-mod',
  shoeId: 'S1',
  targetRound: 3,
  decision: 'BET_BANKER',
  side: 'BANKER',
  confidence: 0.58,
  category: 'EXPERIMENTAL',
  decisionConfigVersion: 'DECISION-004',
  balancedConfigVersion: 'BALCFG-001',
  balancedThreshold: 0.53,
  profileComparison: {
    selectedProfile: 'BALANCED',
    balanced: { decision: 'BET_BANKER', category: 'EXPERIMENTAL' },
    strict: { decision: 'SKIP', category: 'BELOW_THRESHOLD' },
  },
  matcherAudit: {
    configVersion: 'HMATCH-002',
    fingerprintVersion: 'MATCHFP-001',
    relPriorVersion: 'RELPRIOR-002',
    neighbors: 7,
    quality: 'ELIGIBLE',
  },
  lockedAt: 't',
});

const lpe = (
  over: Partial<LockedPredictionEntryRecord> & Pick<LockedPredictionEntryRecord, 'id' | 'targetRoundNumber' | 'sequenceIndex'>,
): LockedPredictionEntryRecord => ({
  shoeId: 'S1',
  status: 'EVALUATED',
  decision: 'BET_BANKER',
  side: 'BANKER',
  confidence: 0.58,
  category: 'EXPERIMENTAL',
  operatorAction: 'PLAYED',
  evaluation: 'WIN',
  actualWinner: 'BANKER',
  invalidated: false,
  invalidatedByRevisionId: null,
  invalidatedAt: null,
  lockedAt: 't',
  evaluatedAt: 't',
  payloadVersion: 'SESSION-001',
  payload: '{"id":"x"}',
  createdAt: 't',
  ...over,
});

function sampleDataset(): BappDataset {
  return {
    shoes: [
      {
        id: 'S1',
        label: 'Shoe One',
        environment: 'LIVE_FORWARD',
        status: 'ACTIVE',
        roundCount: 2,
        createdAt: 't',
        updatedAt: 't',
      },
    ] as BappDataset['shoes'],
    rounds: [
      { id: 'r1', shoeId: 'S1', roundNumber: 1, winner: 'BANKER', playerPair: 'UNKNOWN', bankerPair: 'UNKNOWN', source: 'LIVE', createdAt: 't' },
      { id: 'r2', shoeId: 'S1', roundNumber: 2, winner: 'PLAYER', playerPair: 'UNKNOWN', bankerPair: 'UNKNOWN', source: 'LIVE', createdAt: 't' },
    ] as BappDataset['rounds'],
    revisions: [
      { id: 'v1', shoeId: 'S1', roundNumber: 1, action: 'INSERT', before: null, after: '{}', createdAt: 't' },
    ] as BappDataset['revisions'],
    lockedPredictions: [
      lpe({ id: 'p-mod', targetRoundNumber: 3, sequenceIndex: 0, payload: MODERN_PAYLOAD, evaluation: 'PENDING', status: 'LOCKED', actualWinner: null }),
      lpe({ id: 'p-old', targetRoundNumber: 2, sequenceIndex: 1, category: 'QUALIFIED', payload: '{"id":"p-old"}' }),
    ],
    sessionStates: [],
  };
}

const toFileBodyAndBack = (exp: BappExport): unknown => JSON.parse(serializeExport(exp));

// ===========================================================================
// SECTION 18 — FILE TRANSPORT round-trip / rejection / summary
// ===========================================================================
describe('M7.2 file transport', () => {
  it('filenames follow the documented convention', () => {
    const d = new Date(Date.UTC(2026, 0, 2, 9, 30));
    // fileStamp uses local time; just assert structure + extension.
    expect(exportFileName('FULL_BACKUP', d)).toMatch(/^BAPP-Full-Backup-\d{4}-\d{2}-\d{2}-\d{4}\.bappbackup$/);
    expect(exportFileName('HISTORY', d)).toContain('BAPP-History-');
    expect(exportFileName('ANALYSIS', d)).toContain('BAPP-Analysis-');
    expect(exportFileName('FULL_BACKUP', d).endsWith(BAPP_BACKUP_EXTENSION)).toBe(true);
    expect(rawSqliteFileName(d)).toMatch(/^BAPP-Raw-Snapshot-\d{4}-\d{2}-\d{2}-\d{4}\.db$/);
    expect(fileStamp(d)).toMatch(/^\d{4}-\d{2}-\d{2}-\d{4}$/);
  });

  it('A: FULL_BACKUP serialize -> file body -> read -> validate', () => {
    const exp = buildExport(sampleDataset(), { kind: 'FULL_BACKUP', source: 'native-sqlite', now: 't' });
    const ins = inspectImport('BAPP-Full-Backup.bappbackup', serializeExport(exp), null);
    expect(ins.ok).toBe(true);
    expect(ins.validation.ok).toBe(true);
    expect(ins.summary.type).toBe('FULL_BACKUP');
    expect(isCurrentExportVersion(ins.summary.exportVersion)).toBe(true);
  });

  it('B: HISTORY round-trips (rounds present, no locked predictions)', () => {
    const exp = buildExport(sampleDataset(), { kind: 'HISTORY', source: 'native-sqlite', now: 't' });
    const back = toFileBodyAndBack(exp) as BappExport;
    const v = validateExport(back);
    expect(v.ok).toBe(true);
    expect(back.meta.kind).toBe('HISTORY');
    expect(back.data.rounds).toHaveLength(2);
    expect(back.data.lockedPredictions).toHaveLength(0);
  });

  it('C: ANALYSIS round-trips (locked predictions present, no rounds)', () => {
    const exp = buildExport(sampleDataset(), { kind: 'ANALYSIS', source: 'native-sqlite', now: 't' });
    const back = toFileBodyAndBack(exp) as BappExport;
    const v = validateExport(back);
    expect(v.ok).toBe(true);
    expect(back.meta.kind).toBe('ANALYSIS');
    expect(back.data.lockedPredictions).toHaveLength(2);
    expect(back.data.rounds).toHaveLength(0);
  });

  it('D: malformed file fails validation with a readable error and zero write', () => {
    const ins = inspectImport('broken.bappbackup', '{ not json', null);
    expect(ins.ok).toBe(false);
    expect(ins.parsed).toBeNull();
    expect(ins.plan).toBeNull();
    expect(ins.validation.errors[0].code).toBe('MALFORMED');
  });

  it('E: wrong discriminator / unsupported version is rejected', () => {
    const wrongFormat = { meta: { format: 'NOT-BAPP', formatVersion: 'EXPORT-001', kind: 'FULL_BACKUP' }, data: {} };
    expect(inspectImport('x', JSON.stringify(wrongFormat), null).ok).toBe(false);
    const exp = buildExport(sampleDataset(), { kind: 'FULL_BACKUP', source: 'native-sqlite', now: 't' });
    const badVersion = { ...exp, meta: { ...exp.meta, formatVersion: 'EXPORT-999' } };
    const ins = inspectImport('x', JSON.stringify(badVersion), null);
    expect(ins.ok).toBe(false);
    expect(ins.validation.errors.some((e) => /version/i.test(e.message) || e.code.includes('VERSION'))).toBe(true);
  });

  it('F: valid file summary reports correct counts + merge preview numbers', () => {
    const exp = buildExport(sampleDataset(), { kind: 'FULL_BACKUP', source: 'native-sqlite', now: 't' });
    // Import into an EMPTY dataset => everything is new, nothing conflicts.
    const empty: BappDataset = { shoes: [], rounds: [], revisions: [], lockedPredictions: [], sessionStates: [] };
    const ins = inspectImport('BAPP-Full-Backup.bappbackup', serializeExport(exp), empty);
    expect(ins.summary).toMatchObject({
      type: 'FULL_BACKUP',
      exportVersion: 'EXPORT-001',
      shoes: 1,
      rounds: 2,
      lockedPredictions: 2,
      conflicts: 0,
      duplicates: 0,
    });
    // new records = 1 shoe + 2 rounds + 1 revision + 2 predictions.
    expect(ins.summary.newRecords).toBe(6);
  });
});

// ===========================================================================
// SECTION 20 — MODERN PAYLOAD byte-identical round-trip
// ===========================================================================
describe('M7.2 modern payload round-trip', () => {
  it('DECISION-004 / BALCFG-001 threshold + matcherAudit + profileComparison survive', () => {
    const exp = buildExport(sampleDataset(), { kind: 'FULL_BACKUP', source: 'native-sqlite', now: 't' });
    const back = toFileBodyAndBack(exp) as BappExport;
    const modern = back.data.lockedPredictions.find((p) => p.id === 'p-mod')!;
    // The immutable payload string is preserved byte-for-byte.
    expect(modern.payload).toBe(MODERN_PAYLOAD);
    const decoded = JSON.parse(modern.payload) as Record<string, unknown>;
    expect(decoded.decisionConfigVersion).toBe('DECISION-004');
    expect(decoded.balancedConfigVersion).toBe('BALCFG-001');
    expect(decoded.balancedThreshold).toBe(0.53);
    expect((decoded.matcherAudit as Record<string, unknown>).configVersion).toBe('HMATCH-002');
    expect((decoded.profileComparison as Record<string, unknown>).selectedProfile).toBe('BALANCED');
  });
});

// ===========================================================================
// SECTION 21 — IMPORT VIEW-MODEL states
// ===========================================================================
describe('M7.2 import view-model', () => {
  const exp = buildExport(sampleDataset(), { kind: 'FULL_BACKUP', source: 'native-sqlite', now: 't' });
  const emptyDs: BappDataset = { shoes: [], rounds: [], revisions: [], lockedPredictions: [], sessionStates: [] };

  it('IDLE when no file selected', () => {
    const v = idleImportView();
    expect(v.phase).toBe('IDLE');
    expect(v.mergeReady).toBe(false);
    expect(v.restoreReady).toBe(false);
  });

  it('INVALID for a malformed file (no merge/restore)', () => {
    const ins = inspectImport('bad', 'nope', emptyDs);
    const v = deriveImportView(ins, true);
    expect(v.phase).toBe('INVALID');
    expect(v.mergeReady).toBe(false);
    expect(v.restoreReady).toBe(false);
  });

  it('VALID FULL_BACKUP on writable runtime -> merge + restore available', () => {
    const ins = inspectImport('f.bappbackup', serializeExport(exp), emptyDs);
    const v = deriveImportView(ins, true);
    expect(v.phase).toBe('VALID');
    expect(v.mergeReady).toBe(true);
    expect(v.restoreReady).toBe(true);
  });

  it('web preview (canWrite=false) disables both writes even when VALID', () => {
    const ins = inspectImport('f.bappbackup', serializeExport(exp), emptyDs);
    const v = deriveImportView(ins, false);
    expect(v.phase).toBe('VALID');
    expect(v.mergeReady).toBe(false);
    expect(v.restoreReady).toBe(false);
  });

  it('HISTORY file -> merge available, restore NOT available', () => {
    const hist = buildExport(sampleDataset(), { kind: 'HISTORY', source: 'native-sqlite', now: 't' });
    const ins = inspectImport('h.bappbackup', serializeExport(hist), emptyDs);
    const v = deriveImportView(ins, true);
    expect(v.mergeReady).toBe(true);
    expect(v.restoreReady).toBe(false);
  });

  it('conflicting import (same id, different content) -> not merge-ready', () => {
    // Existing dataset already has a DIFFERENT shoe under the same id.
    const existing: BappDataset = { ...emptyDs, shoes: [{ ...sampleDataset().shoes[0], label: 'DIFFERENT' }] };
    const ins = inspectImport('f.bappbackup', serializeExport(exp), existing);
    expect(ins.summary.conflicts).toBeGreaterThan(0);
    const v = deriveImportView(ins, true);
    expect(v.mergeReady).toBe(false); // conflicts => plan.safe === false
  });
});

// ===========================================================================
// SECTION 19 — FILE-PATH MERGE / RESTORE integration + RESTART persistence
// ===========================================================================
async function freshDb(): Promise<SqlJsDatabase> {
  const db = await SqlJsDatabase.open();
  await runMigrations(db);
  return db;
}

async function seed(db: SqlJsDatabase): Promise<void> {
  await db.runAsync(
    'INSERT INTO shoes (id,label,environment,status,round_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?);',
    ['S1', 'Shoe One', 'LIVE_FORWARD', 'ACTIVE', 2, 't', 't'],
  );
  for (const [id, n, w] of [['r1', 1, 'BANKER'], ['r2', 2, 'PLAYER']] as [string, number, string][]) {
    await db.runAsync(
      'INSERT INTO rounds (id,shoe_id,round_number,winner,player_pair,banker_pair,source,created_at) VALUES (?,?,?,?,?,?,?,?);',
      [id, 'S1', n, w, 'UNKNOWN', 'UNKNOWN', 'LIVE', 't'],
    );
  }
  await db.runAsync(
    `INSERT INTO locked_prediction_entries (
       id,shoe_id,target_round_number,sequence_index,status,decision,side,confidence,category,
       operator_action,evaluation,actual_winner,invalidated,invalidated_by_revision_id,invalidated_at,
       locked_at,evaluated_at,payload_version,payload,created_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);`,
    ['p-mod', 'S1', 3, 0, 'LOCKED', 'BET_BANKER', 'BANKER', 0.58, 'EXPERIMENTAL', 'UNSET', 'PENDING', null,
      0, null, null, 't', null, 'SESSION-001', MODERN_PAYLOAD, 't'],
  );
}

describe('M7.2 file-path restore/merge integration', () => {
  it('restore FULL_BACKUP into empty DB -> persists across restart, modern payload intact', async () => {
    const src = await freshDb();
    await seed(src);
    const exp = buildExport(await loadDataset(src), { kind: 'FULL_BACKUP', source: 'native-sqlite', now: 't' });
    const fileBody = serializeExport(exp);

    // "Choose file" -> inspect -> restore on a fresh DB.
    const target = await freshDb();
    const ins = inspectImport('BAPP-Full-Backup.bappbackup', fileBody, await loadDataset(target));
    expect(ins.ok).toBe(true);
    await restoreBackup(target, ins.parsed!);

    // Restart: reload authoritative dataset from the persisted DB.
    const restored = await loadDataset(target);
    expect(restored.shoes).toHaveLength(1);
    expect(restored.rounds).toHaveLength(2);
    expect(restored.lockedPredictions).toHaveLength(1);
    expect(restored.lockedPredictions[0].payload).toBe(MODERN_PAYLOAD);
    // exactly one valid lock for the shoe/target — invariant preserved.
    const dup = await target.getAllAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM locked_prediction_entries WHERE shoe_id='S1' AND target_round_number=3 AND invalidated=0;`,
    );
    expect(dup[0].n).toBe(1);
  });

  it('merge adds independent records; a conflicting valid lock is refused (no duplicate)', async () => {
    const src = await freshDb();
    await seed(src);
    const exp = buildExport(await loadDataset(src), { kind: 'FULL_BACKUP', source: 'native-sqlite', now: 't' });

    // Target already has the SAME shoe + a DIFFERENT valid lock for target 3.
    const target = await freshDb();
    await seed(target);
    await target.runAsync(
      `UPDATE locked_prediction_entries SET id='p-other' WHERE id='p-mod';`,
    );

    const plan = planMerge(await loadDataset(target), exp);
    // incoming p-mod is a valid lock for S1::3 which already has p-other => conflict.
    expect(plan.report.conflicts.some((c) => c.collection === 'lockedPredictions')).toBe(true);
    expect(plan.safe).toBe(false);

    // A safe merge into an empty DB adds everything and keeps one valid lock.
    const empty = await freshDb();
    const safePlan = planMerge(await loadDataset(empty), exp);
    expect(safePlan.safe).toBe(true);
    await applyMerge(empty, safePlan);
    const after = await loadDataset(empty);
    expect(after.shoes).toHaveLength(1);
    expect(after.lockedPredictions).toHaveLength(1);
    const dup = await empty.getAllAsync<{ n: number }>(
      `SELECT target_round_number, COUNT(*) AS n FROM locked_prediction_entries WHERE invalidated=0 GROUP BY target_round_number HAVING n>1;`,
    );
    expect(dup).toHaveLength(0);
  });
});
