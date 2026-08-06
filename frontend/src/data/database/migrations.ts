import { DB_001_STATEMENTS } from './schema';
import { SqlDatabase } from './sql-database';

/** An ordered, append-only database migration. Accepted migrations are immutable. */
export interface DbMigration {
  readonly version: string;
  readonly statements: readonly string[];
}

/** The migration ledger. Never edit an accepted migration — append a new one. */
export const MIGRATIONS: readonly DbMigration[] = Object.freeze([
  { version: 'DB-001', statements: DB_001_STATEMENTS },
] as const);

/** The current (latest) database schema version. */
export const CURRENT_DB_VERSION = 'DB-001';

interface MigrationRow {
  version: string;
}

/**
 * Apply all pending migrations. Each migration runs inside a transaction and is
 * recorded in `schema_migrations`; already-applied migrations are skipped
 * (idempotent). Parameterized statements are used for the ledger writes.
 */
export async function runMigrations(db: SqlDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version TEXT PRIMARY KEY NOT NULL,
       applied_at TEXT NOT NULL
     );`,
  );

  for (const migration of MIGRATIONS) {
    const existing = await db.getFirstAsync<MigrationRow>(
      'SELECT version FROM schema_migrations WHERE version = ?;',
      [migration.version],
    );
    if (existing) continue;

    await db.withTransactionAsync(async () => {
      for (const statement of migration.statements) {
        await db.execAsync(statement);
      }
      await db.runAsync(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?);',
        [migration.version, new Date().toISOString()],
      );
    });
  }
}
