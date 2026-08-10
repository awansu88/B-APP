/**
 * NATIVE data source — authoritative SQLite/DB-002 read + transactional
 * Merge/Restore apply over the shared `bapp.db`. Only bundled on native (web
 * uses `.web.ts`), so expo-sqlite never enters the web bundle.
 */
import { getAppDatabase } from '@/src/data/database/app-database';
import { applyMerge as applyMergeTx, loadDataset, restoreBackup } from '@/src/data/backup';
import type { DataSource } from './data-source';

export async function createDataSource(): Promise<DataSource> {
  const db = await getAppDatabase();
  return {
    runtime: 'native-sqlite',
    canWrite: true,
    loadDataset: () => loadDataset(db),
    applyMerge: (plan) => applyMergeTx(db, plan),
    restore: (exp) => restoreBackup(db, exp),
    serializeDatabase: () => db.serializeAsync(),
  };
}
