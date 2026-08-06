/**
 * WEB store factory. The expo-sqlite web backend (wa-sqlite / OPFS) is not
 * reliably available in the preview, so the web build persists rounds via
 * AsyncStorage. This file deliberately never imports expo-sqlite, keeping the
 * native module (and its wasm asset) out of the web bundle entirely.
 */
import { HistoryStore, MemoryHistoryStore } from './history-store';

export async function createHistoryStore(): Promise<HistoryStore> {
  return new MemoryHistoryStore();
}
