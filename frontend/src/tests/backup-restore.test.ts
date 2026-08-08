/**
 * Milestone 6 — backup / restore tests (sql.js, transactional + verified).
 *
 * Source DB -> Full Backup -> empty DB -> Restore -> compare authoritative
 * records. Verifies preservation of shoes/rounds/revisions/locked-prediction
 * audit + invalidation, and that derived roadmap/sequence/paper reconstructions
 * are identical (NO prediction regenerated — payloads copied verbatim).
 */
import { SqlJsDatabase } from './support/sqljs-database';
import { runMigrations } from '@/src/data/database/migrations';
import { loadDataset, restoreBackup } from '@/src/data/backup';
import { buildExport } from '@/src/domain/backup';
import { computeFullStatistics } from '@/src/domain/statistics';
import { buildRoadmap } from '@/src/domain/roadmap/engine';
import type { BappExport } from '@/src/domain/backup';

async function freshDb(): Promise<SqlJsDatabase> {
  const db = await SqlJsDatabase.open();
  await runMigrations(db);
  return db;
}

/** Seed a source DB with two shoes, rounds, a revision and locked predictions. */
async function seedSource(db: SqlJsDatabase): Promise<void> {
  await db.runAsync(
    'INSERT INTO shoes (id,label,environment,status,round_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?);',
    ['S1', 'Shoe One', 'LIVE_FORWARD', 'ACTIVE', 3, 'a', 'a'],
  );
  await db.runAsync(
    'INSERT INTO shoes (id,label,environment,status,round_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?);',
    ['S2', null, 'HISTORICAL_TEST', 'ARCHIVED', 1, 'b', 'b'],
  );
  const rounds: [string, string, number, string][] = [
    ['r1', 'S1', 1, 'PLAYER'], ['r2', 'S1', 2, 'BANKER'], ['r3', 'S1', 3, 'TIE'], ['r9', 'S2', 1, 'PLAYER'],
  ];
  for (const [id, shoeId, n, w] of rounds) {
    await db.runAsync(
      'INSERT INTO rounds (id,shoe_id,round_number,winner,player_pair,banker_pair,source,created_at) VALUES (?,?,?,?,?,?,?,?);',
      [id, shoeId, n, w, 'UNKNOWN', 'UNKNOWN', 'LIVE', 't'],
    );
  }
  await db.runAsync(
    'INSERT INTO revisions (id,shoe_id,round_number,action,before,after,created_at) VALUES (?,?,?,?,?,?,?);',
    ['v1', 'S1', 1, 'INSERT', null, '{}', 't'],
  );
  const lpes: [string, string, number, number, string, boolean][] = [
    ['p1', 'S1', 1, 0, 'WIN', false],
    ['p2', 'S1', 2, 1, 'LOSS', false],
    ['p3', 'S1', 3, 2, 'INVALIDATED', true],
  ];
  for (const [id, shoeId, target, seq, evaluation, inval] of lpes) {
    await db.runAsync(
      `INSERT INTO locked_prediction_entries (
         id,shoe_id,target_round_number,sequence_index,status,decision,side,confidence,category,
         operator_action,evaluation,actual_winner,invalidated,invalidated_by_revision_id,invalidated_at,
         locked_at,evaluated_at,payload_version,payload,created_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);`,
      [id, shoeId, target, seq, inval ? 'VOID' : 'EVALUATED', 'BET_PLAYER', 'PLAYER', 0.62, 'QUALIFIED',
        'PLAYED', evaluation, 'PLAYER', inval ? 1 : 0, null, null, 't', 't', 'SESSION-001',
        `{"id":"${id}","locked":true}`, 't'],
    );
  }
  await db.runAsync(
    `INSERT INTO session_state (
       shoe_id,session_version,workflow,environment,current_target_round,
       paper_units_staked,paper_net_units,paper_wins,paper_losses,paper_pushes,created_at,updated_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?);`,
    ['S1', 'SESSION-001', 'WAITING_FOR_RESULT', 'LIVE_FORWARD', 4, 2, 0, 1, 1, 0, 't', 't'],
  );
}

describe('backup / restore', () => {
  it('restores a full backup and preserves every authoritative record', async () => {
    const source = await freshDb();
    await seedSource(source);
    const sourceData = await loadDataset(source);

    const exp = buildExport(sourceData, { kind: 'FULL_BACKUP', source: 'native-sqlite', now: 't' });
    expect(exp.meta.counts.lockedPredictions).toBe(3);

    const target = await freshDb();
    const result = await restoreBackup(target, exp);
    expect(result).toEqual({ shoes: 2, rounds: 4, revisions: 1, lockedPredictions: 3, sessionStates: 1 });

    const restored = await loadDataset(target);
    // Authoritative records identical, including invalidation flags + payloads.
    expect(restored).toEqual(sourceData);
    const invalidated = restored.lockedPredictions.filter((p) => p.invalidated);
    expect(invalidated).toHaveLength(1);
    expect(restored.lockedPredictions.find((p) => p.id === 'p1')!.payload).toBe('{"id":"p1","locked":true}');
  });

  it('reconstructs roadmap + sequence + paper identically after restore', async () => {
    const source = await freshDb();
    await seedSource(source);
    const sourceData = await loadDataset(source);
    const exp = buildExport(sourceData, { kind: 'FULL_BACKUP', source: 'native-sqlite', now: 't' });
    const target = await freshDb();
    await restoreBackup(target, exp);
    const restored = await loadDataset(target);

    // Roadmap rebuilds purely from raw rounds -> identical.
    expect(buildRoadmap(restored.rounds.filter((r) => r.shoeId === 'S1'))).toEqual(
      buildRoadmap(sourceData.rounds.filter((r) => r.shoeId === 'S1')),
    );
    // Sequence + paper statistics recomputed from restored audit -> identical.
    expect(computeFullStatistics(restored)).toEqual(computeFullStatistics(sourceData));
  });

  it('rolls back a failing restore, leaving prior data intact', async () => {
    const source = await freshDb();
    await seedSource(source);
    const sourceData = await loadDataset(source);
    const good = buildExport(sourceData, { kind: 'FULL_BACKUP', source: 'native-sqlite', now: 't' });

    const target = await freshDb();
    await restoreBackup(target, good);
    const beforeBad = await loadDataset(target);

    // A backup whose data would violate the shoes PK mid-insert.
    const bad: BappExport = {
      meta: { ...good.meta },
      data: { ...good.data, shoes: [...good.data.shoes, good.data.shoes[0]] },
    };
    await expect(restoreBackup(target, bad)).rejects.toThrow();
    const afterBad = await loadDataset(target);
    expect(afterBad).toEqual(beforeBad);
  });
});
