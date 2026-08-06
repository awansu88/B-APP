/**
 * NATIVE store factory. Opens the accepted DB-001 SQLite database via the
 * expo-sqlite adapter and runs migrations. This file (and its static
 * expo-sqlite import) is only bundled on native — web uses `create-store.web.ts`.
 */
import { ExpoSqliteDatabase } from '@/src/data/database/expo-sqlite-database';
import { runMigrations } from '@/src/data/database/migrations';
import type { SqlDatabase } from '@/src/data/database/sql-database';

import {
  HistoryStore,
  MemoryHistoryStore,
  SqliteHistoryStore,
} from './history-store';

let cachedDb: SqlDatabase | null = null;

async function openDatabase(): Promise<SqlDatabase> {
  if (cachedDb) return cachedDb;
  const db = await ExpoSqliteDatabase.open('bapp.db');
  await runMigrations(db);
  cachedDb = db;
  return db;
}

/**
 * Create the History store for the current device. Falls back to the in-memory
 * / AsyncStorage store if SQLite cannot be opened for any reason.
 */
export async function createHistoryStore(): Promise<HistoryStore> {
  try {
    const db = await openDatabase();
    return new SqliteHistoryStore(db);
  } catch {
    return new MemoryHistoryStore();
  }
}
