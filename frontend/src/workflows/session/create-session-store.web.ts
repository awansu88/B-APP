/**
 * WEB session-store factory (AsyncStorage-compatible fallback). Preview
 * compatibility only; native SQLite/DB-002 is the authoritative architecture.
 * Never imports expo-sqlite.
 */
import { storage } from '@/src/utils/storage';
import { MemorySessionStore, type CreatedSessionStore } from './session-store';

export async function createSessionStore(): Promise<CreatedSessionStore> {
  return { store: new MemorySessionStore(storage), kind: 'memory' };
}
