/**
 * NATIVE store factory. Uses the process-wide authoritative SQLite database
 * provider. This file (and the provider's static
 * expo-sqlite import) is only bundled on native — web uses `create-store.web.ts`.
 */
import { getAppDatabase } from '@/src/data/database/app-database';

import {
  HistoryStore,
  SqliteHistoryStore,
} from './history-store';

/**
 * Create the authoritative History store for the current device. Initialization
 * failures remain observable; native must not silently downgrade persistence.
 */
export async function createHistoryStore(): Promise<HistoryStore> {
  const db = await getAppDatabase();
  return new SqliteHistoryStore(db);
}
