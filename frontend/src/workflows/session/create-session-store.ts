/**
 * Native platform factory for the Milestone-5 session store. The web bundle uses
 * `create-session-store.web.ts` (AsyncStorage) so the native expo-sqlite adapter
 * is never pulled into the web build.
 */
import type { SqlDatabase } from '@/src/data/database/sql-database';
import { SessionStore, SqliteSessionStore } from './session-store';

export function createSessionStore(db: SqlDatabase): SessionStore {
  return new SqliteSessionStore(db);
}
