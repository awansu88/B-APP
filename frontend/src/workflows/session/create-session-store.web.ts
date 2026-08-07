/**
 * Web platform factory for the Milestone-5 session store (AsyncStorage fallback).
 * Preview compatibility only; native SQLite/DB-002 is the authoritative store.
 */
import { MemorySessionStore, SessionStore } from './session-store';
import { storage } from '@/src/utils/storage';

export function createSessionStore(): SessionStore {
  return new MemorySessionStore(storage);
}
