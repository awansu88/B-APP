/**
 * The single process-wide owner of native `bapp.db` initialization.
 *
 * Cache the initialization promise (rather than only the resolved database) so
 * every native workflow shares one open/migration operation, including callers
 * that arrive while initialization is still in progress.
 */
import { ExpoSqliteDatabase } from './expo-sqlite-database';
import { runMigrations } from './migrations';

let dbPromise: Promise<ExpoSqliteDatabase> | null = null;

export function getAppDatabase(): Promise<ExpoSqliteDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    try {
      const db = await ExpoSqliteDatabase.open('bapp.db');
      await runMigrations(db);
      return db;
    } catch (error) {
      dbPromise = null;
      throw error;
    }
  })();

  return dbPromise;
}
