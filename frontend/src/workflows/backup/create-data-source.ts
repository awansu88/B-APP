/**
 * NATIVE data source — authoritative SQLite/DB-002 read + transactional
 * Merge/Restore apply over the shared `bapp.db`. Only bundled on native (web
 * uses `.web.ts`), so expo-sqlite never enters the web bundle.
 */
import { ExpoSqliteDatabase } from '@/src/data/database/expo-sqlite-database';
import { runMigrations } from '@/src/data/database/migrations';
import { applyMerge as applyMergeTx, loadDataset, restoreBackup } from '@/src/data/backup';
import type { DataSource } from './data-source';

let cachedDb: ExpoSqliteDatabase | null = null;

async function openDatabase(): Promise<ExpoSqliteDatabase> {
  if (cachedDb) return cachedDb;
  const db = await ExpoSqliteDatabase.open('bapp.db');
  await runMigrations(db);
  cachedDb = db;
  return db;
}

export async function createDataSource(): Promise<DataSource> {
  const db = await openDatabase();
  return {
    runtime: 'native-sqlite',
    canWrite: true,
    loadDataset: () => loadDataset(db),
    applyMerge: (plan) => applyMergeTx(db, plan),
    restore: (exp) => restoreBackup(db, exp),
    serializeDatabase: () => db.serializeAsync(),
  };
}
