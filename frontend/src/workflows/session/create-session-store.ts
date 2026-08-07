/**
 * NATIVE session-store factory. Opens the shared DB-002 SQLite database
 * (`bapp.db`, same file the History store uses) via expo-sqlite and runs the
 * (idempotent) migrations. Only bundled on native; web uses the `.web.ts`
 * variant so expo-sqlite never enters the web bundle.
 */
import { ExpoSqliteDatabase } from '@/src/data/database/expo-sqlite-database';
import { runMigrations } from '@/src/data/database/migrations';
import type { SqlDatabase } from '@/src/data/database/sql-database';
import { storage } from '@/src/utils/storage';
import {
  MemorySessionStore,
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
 * Native: authoritative SQLite/DB-002 store. Falls back to the AsyncStorage
 * store only if SQLite cannot be opened (a development warning is surfaced by
 * the caller via the reported `kind`).
 */
export async function createSessionStore(): Promise<CreatedSessionStore> {
  try {
    const db = await openDatabase();
    return { store: new SqliteSessionStore(db), kind: 'sqlite' };
  } catch {
    return { store: new MemorySessionStore(storage), kind: 'memory' };
  }
}
