/**
 * NATIVE session-store factory. Opens the shared DB-002 SQLite database
 * (`bapp.db`, same file the History store uses) via expo-sqlite and runs the
 * (idempotent) migrations. Only bundled on native; web uses the `.web.ts`
 * variant so expo-sqlite never enters the web bundle.
 *
 * FAIL-SAFE POLICY (Milestone 5C): durable SQLite/DB-002 persistence is REQUIRED
 * for a native Live/Historical-Test locked-prediction session. If SQLite cannot
 * be opened or migrated we DO NOT silently downgrade to a volatile
 * AsyncStorage/MemorySessionStore — that would fabricate persistence success for
 * an authoritative decision audit. Instead we throw a clear, retryable
 * `SessionPersistenceUnavailableError`; the caller disables actual-result
 * submission and surfaces a non-destructive retry.
 */
import { ExpoSqliteDatabase } from '@/src/data/database/expo-sqlite-database';
import { runMigrations } from '@/src/data/database/migrations';
import type { SqlDatabase } from '@/src/data/database/sql-database';
import {
  SessionPersistenceUnavailableError,
  SqliteSessionStore,
  type CreatedSessionStore,
} from './session-store';

let cachedDb: SqlDatabase | null = null;

async function openDatabase(): Promise<SqlDatabase> {
  if (cachedDb) return cachedDb;
  const db = await ExpoSqliteDatabase.open('bapp.db');
  await runMigrations(db);
  cachedDb = db;
  return db;
}

/**
 * Native: authoritative SQLite/DB-002 store. NEVER falls back to a volatile
 * store for a live persisted session — a failed init throws so the operator is
 * blocked from submitting actual results against a non-durable store.
 */
export async function createSessionStore(): Promise<CreatedSessionStore> {
  try {
    const db = await openDatabase();
    return { store: new SqliteSessionStore(db), kind: 'sqlite' };
  } catch (e) {
    if (e instanceof SessionPersistenceUnavailableError) throw e;
    throw new SessionPersistenceUnavailableError(e);
  }
}
