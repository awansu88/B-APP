import {
  RoundSource,
  SessionEnvironment,
  ShoeStatus,
} from '@/src/domain/models/enums';
import { Winner } from '@/src/domain/models/outcome';
import { PairState } from '@/src/domain/models/pair';
import type { RoundRecord } from '@/src/domain/models/round';
import type { ShoeRecord } from '@/src/domain/models/records';
import { CURRENT_DB_VERSION, runMigrations } from '@/src/data/database/migrations';
import { SqlDatabase } from '@/src/data/database/sql-database';
import { RoundRepository } from '@/src/data/repositories/round-repository';
import { RevisionRepository } from '@/src/data/repositories/revision-repository';
import { ShoeRepository as ShoeRepo } from '@/src/data/repositories/shoe-repository';
import { SqlJsDatabase } from './support/sqljs-database';

const NOW = '2026-01-01T00:00:00.000Z';

const makeShoe = (id: string): ShoeRecord => ({
  id,
  label: `Shoe ${id}`,
  environment: SessionEnvironment.HISTORY_INPUT,
  status: ShoeStatus.ACTIVE,
  roundCount: 0,
  createdAt: NOW,
  updatedAt: NOW,
});

const makeRound = (shoeId: string, roundNumber: number, winner: Winner): RoundRecord => ({
  id: `${shoeId}-r${roundNumber}`,
  shoeId,
  roundNumber,
  winner,
  playerPair: PairState.UNKNOWN,
  bankerPair: PairState.UNKNOWN,
  source: RoundSource.HISTORY,
  createdAt: NOW,
});

async function freshDb(): Promise<SqlDatabase> {
  const db = await SqlJsDatabase.open();
  await runMigrations(db);
  return db;
}

interface NameRow {
  name: string;
}

describe('database — DB-001 migrations & repositories', () => {
  it('migration creation builds every table and records DB-001', async () => {
    const db = await freshDb();
    const rows = await db.getAllAsync<NameRow>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;",
    );
    const names = rows.map((r) => r.name);
    for (const table of [
      'shoes',
      'rounds',
      'snapshots',
      'predictions',
      'module_results',
      'sequences',
      'revisions',
      'engine_configs',
      'export_history',
      'diagnostic_events',
      'schema_migrations',
    ]) {
      expect(names).toContain(table);
    }
    const applied = await db.getFirstAsync<{ version: string }>(
      'SELECT version FROM schema_migrations WHERE version = ?;',
      [CURRENT_DB_VERSION],
    );
    expect(applied?.version).toBe('DB-001');
  });

  it('migrations are idempotent (running twice is a no-op)', async () => {
    const db = await freshDb();
    await runMigrations(db);
    const count = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM schema_migrations;',
    );
    expect(count?.n).toBe(1);
  });

  it('shoe insert and retrieval', async () => {
    const db = await freshDb();
    const shoes = new ShoeRepo(db);
    const shoe = makeShoe('s1');
    await shoes.insert(shoe);
    expect(await shoes.getById('s1')).toEqual(shoe);
    expect(await shoes.list()).toHaveLength(1);
  });

  it('sequential rounds are stored and returned in order', async () => {
    const db = await freshDb();
    await new ShoeRepo(db).insert(makeShoe('s1'));
    const rounds = new RoundRepository(db);
    await rounds.append(makeRound('s1', 1, Winner.PLAYER));
    await rounds.append(makeRound('s1', 2, Winner.BANKER));
    await rounds.append(makeRound('s1', 3, Winner.PLAYER));
    const list = await rounds.listByShoe('s1');
    expect(list.map((r) => r.roundNumber)).toEqual([1, 2, 3]);
    expect(list.map((r) => r.winner)).toEqual([
      Winner.PLAYER,
      Winner.BANKER,
      Winner.PLAYER,
    ]);
  });

  it('duplicate round (same shoe + round number) is rejected', async () => {
    const db = await freshDb();
    await new ShoeRepo(db).insert(makeShoe('s1'));
    const rounds = new RoundRepository(db);
    await rounds.append(makeRound('s1', 1, Winner.PLAYER));
    await expect(
      rounds.append({ ...makeRound('s1', 1, Winner.BANKER), id: 's1-dup' }),
    ).rejects.toThrow();
    // The rejected insert rolled back — only the first round persists.
    expect(await rounds.listByShoe('s1')).toHaveLength(1);
  });

  it('transaction rollback discards partial writes', async () => {
    const db = await freshDb();
    const shoes = new ShoeRepo(db);
    await expect(
      db.withTransactionAsync(async () => {
        await shoes.insert(makeShoe('s1'));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await shoes.getById('s1')).toBeNull();
  });

  it('data persistence abstraction: repositories work on any SqlDatabase driver', async () => {
    const db = await freshDb();
    await new ShoeRepo(db).insert(makeShoe('s1'));
    const rounds = new RoundRepository(db);
    await rounds.append(makeRound('s1', 1, Winner.PLAYER));
    const fetched = await rounds.getByShoeAndNumber('s1', 1);
    expect(fetched?.winner).toBe(Winner.PLAYER);
  });

  it('revision creation: appending a round writes an INSERT revision', async () => {
    const db = await freshDb();
    await new ShoeRepo(db).insert(makeShoe('s1'));
    await new RoundRepository(db).append(makeRound('s1', 1, Winner.PLAYER));
    const revisions = await new RevisionRepository(db).listByShoe('s1');
    expect(revisions).toHaveLength(1);
    expect(revisions[0].action).toBe('INSERT');
    expect(revisions[0].roundNumber).toBe(1);
  });

  it('schema integrity: UNIQUE(shoe_id, round_number) and required indexes exist', async () => {
    const db = await freshDb();
    const roundsSql = await db.getFirstAsync<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'rounds';",
    );
    expect(roundsSql?.sql).toContain('UNIQUE (shoe_id, round_number)');

    const indexRows = await db.getAllAsync<NameRow>(
      "SELECT name FROM sqlite_master WHERE type = 'index';",
    );
    const indexes = indexRows.map((r) => r.name);
    for (const idx of [
      'idx_rounds_shoe_id',
      'idx_predictions_target_round',
      'idx_predictions_shoe_id',
      'idx_predictions_environment',
      'idx_predictions_category',
    ]) {
      expect(indexes).toContain(idx);
    }
  });

  it('foreign key enforcement: a round for a missing shoe is rejected', async () => {
    const db = await freshDb();
    await expect(
      new RoundRepository(db).append(makeRound('ghost-shoe', 1, Winner.PLAYER)),
    ).rejects.toThrow();
  });

  it('update() edits a round in place and writes an UPDATE revision', async () => {
    const db = await freshDb();
    await new ShoeRepo(db).insert(makeShoe('s1'));
    const rounds = new RoundRepository(db);
    await rounds.append(makeRound('s1', 1, Winner.PLAYER));
    const edited = { ...makeRound('s1', 1, Winner.BANKER) };
    const revision = {
      id: 'rev-s1-r1-update',
      shoeId: 's1',
      roundNumber: 1,
      action: 'UPDATE' as const,
      before: JSON.stringify(makeRound('s1', 1, Winner.PLAYER)),
      after: JSON.stringify(edited),
      createdAt: NOW,
    };
    await rounds.update(edited, revision);
    const fetched = await rounds.getByShoeAndNumber('s1', 1);
    expect(fetched?.winner).toBe(Winner.BANKER);
    const revs = await new RevisionRepository(db).listByShoe('s1');
    expect(revs.some((r) => r.action === 'UPDATE')).toBe(true);
  });

  it('replaceShoe() replaces the full renumbered round set atomically', async () => {
    const db = await freshDb();
    await new ShoeRepo(db).insert(makeShoe('s1'));
    const rounds = new RoundRepository(db);
    await rounds.append(makeRound('s1', 1, Winner.PLAYER));
    await rounds.append(makeRound('s1', 2, Winner.BANKER));
    await rounds.append(makeRound('s1', 3, Winner.PLAYER));

    // Delete round 2 -> renumber remaining to 1..2
    const replacement = [
      makeRound('s1', 1, Winner.PLAYER),
      { ...makeRound('s1', 2, Winner.PLAYER), id: 's1-r3' },
    ];
    const revision = {
      id: 'rev-s1-delete',
      shoeId: 's1',
      roundNumber: 2,
      action: 'DELETE' as const,
      before: JSON.stringify(makeRound('s1', 2, Winner.BANKER)),
      after: null,
      createdAt: NOW,
    };
    await rounds.replaceShoe('s1', replacement, revision);
    const list = await rounds.listByShoe('s1');
    expect(list.map((r) => r.roundNumber)).toEqual([1, 2]);
    expect(list.map((r) => r.winner)).toEqual([Winner.PLAYER, Winner.PLAYER]);
  });

  it('replaceShoe([]) clears every round of a shoe', async () => {
    const db = await freshDb();
    await new ShoeRepo(db).insert(makeShoe('s1'));
    const rounds = new RoundRepository(db);
    await rounds.append(makeRound('s1', 1, Winner.PLAYER));
    await rounds.replaceShoe('s1', [], {
      id: 'rev-s1-clear',
      shoeId: 's1',
      roundNumber: null,
      action: 'DELETE',
      before: null,
      after: null,
      createdAt: NOW,
    });
    expect(await rounds.listByShoe('s1')).toHaveLength(0);
  });
});
