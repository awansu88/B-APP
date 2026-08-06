/**
 * Persistence for the History Input workflow.
 *
 * Raw rounds remain the ONLY source of truth (Project Principle #1); roadmaps
 * are always rebuilt from them. Every mutation is committed as a full,
 * renumbered replacement of the shoe's rounds so both backends stay trivially
 * consistent and duplicate rounds are impossible.
 *
 * Two interchangeable backends implement the same `HistoryStore` contract:
 *  - `SqliteHistoryStore` — the accepted DB-001 SQLite layer (native devices).
 *  - `MemoryHistoryStore` — an AsyncStorage-backed JSON store used on web (where
 *    expo-sqlite's OPFS backend is not always available in the preview). This is
 *    a runtime-availability fallback only; the data shape is identical.
 */
import type { SqlDatabase } from '@/src/data/database/sql-database';
import { RoundRepository } from '@/src/data/repositories/round-repository';
import { ShoeRepository } from '@/src/data/repositories/shoe-repository';
import { SessionEnvironment, ShoeStatus } from '@/src/domain/models/enums';
import type { RevisionRecord, ShoeRecord } from '@/src/domain/models/records';
import type { RoundRecord } from '@/src/domain/models/round';
import { storage } from '@/src/utils/storage';

export interface HistorySnapshot {
  readonly shoe: ShoeRecord;
  readonly rounds: readonly RoundRecord[];
}

export interface HistoryStore {
  /** Load the current ACTIVE shoe (creating one if none exists). */
  loadActive(): Promise<HistorySnapshot>;
  /**
   * Persist the shoe metadata + its full ordered rounds atomically, together
   * with the audit revision (when the change produced one).
   */
  commit(
    shoe: ShoeRecord,
    rounds: readonly RoundRecord[],
    revision: RevisionRecord | null,
  ): Promise<void>;
  /** Archive the active shoe and start a fresh ACTIVE shoe. */
  startNewShoe(previous: ShoeRecord, next: ShoeRecord): Promise<HistorySnapshot>;
}

// --------------------------------------------------------------------------
// SQLite backend (native)
// --------------------------------------------------------------------------

export class SqliteHistoryStore implements HistoryStore {
  private readonly shoes: ShoeRepository;
  private readonly rounds: RoundRepository;

  constructor(private readonly db: SqlDatabase) {
    this.shoes = new ShoeRepository(db);
    this.rounds = new RoundRepository(db);
  }

  async loadActive(): Promise<HistorySnapshot> {
    const all = await this.shoes.list();
    const active = all.find((s) => s.status === ShoeStatus.ACTIVE);
    if (active) {
      const rounds = await this.rounds.listByShoe(active.id);
      return { shoe: active, rounds };
    }
    const shoe = newShoeRecord();
    await this.shoes.insert(shoe);
    return { shoe, rounds: [] };
  }

  async commit(
    shoe: ShoeRecord,
    rounds: readonly RoundRecord[],
    revision: RevisionRecord | null,
  ): Promise<void> {
    await this.shoes.updateMeta(shoe);
    await this.rounds.replaceShoe(
      shoe.id,
      rounds,
      revision ?? clearRevision(shoe.id, shoe.updatedAt),
    );
  }

  async startNewShoe(
    previous: ShoeRecord,
    next: ShoeRecord,
  ): Promise<HistorySnapshot> {
    await this.shoes.updateMeta({
      ...previous,
      status: ShoeStatus.ARCHIVED,
      updatedAt: next.createdAt,
    });
    await this.shoes.insert(next);
    return { shoe: next, rounds: [] };
  }
}

// --------------------------------------------------------------------------
// AsyncStorage backend (web fallback)
// --------------------------------------------------------------------------

interface PersistedState {
  shoes: ShoeRecord[];
  rounds: Record<string, RoundRecord[]>;
}

const STORE_KEY = 'bapp.history.v1';

export class MemoryHistoryStore implements HistoryStore {
  private async read(): Promise<PersistedState> {
    const raw = await storage.getItem<string>(STORE_KEY, '');
    if (!raw) return { shoes: [], rounds: {} };
    try {
      const parsed = JSON.parse(raw) as PersistedState;
      return { shoes: parsed.shoes ?? [], rounds: parsed.rounds ?? {} };
    } catch {
      return { shoes: [], rounds: {} };
    }
  }

  private async write(state: PersistedState): Promise<void> {
    await storage.setItem(STORE_KEY, JSON.stringify(state));
  }

  async loadActive(): Promise<HistorySnapshot> {
    const state = await this.read();
    const active = state.shoes.find((s) => s.status === ShoeStatus.ACTIVE);
    if (active) {
      return { shoe: active, rounds: state.rounds[active.id] ?? [] };
    }
    const shoe = newShoeRecord();
    state.shoes.push(shoe);
    state.rounds[shoe.id] = [];
    await this.write(state);
    return { shoe, rounds: [] };
  }

  async commit(
    shoe: ShoeRecord,
    rounds: readonly RoundRecord[],
    _revision: RevisionRecord | null,
  ): Promise<void> {
    const state = await this.read();
    const idx = state.shoes.findIndex((s) => s.id === shoe.id);
    if (idx === -1) state.shoes.push(shoe);
    else state.shoes[idx] = shoe;
    state.rounds[shoe.id] = rounds.slice();
    await this.write(state);
  }

  async startNewShoe(
    previous: ShoeRecord,
    next: ShoeRecord,
  ): Promise<HistorySnapshot> {
    const state = await this.read();
    const idx = state.shoes.findIndex((s) => s.id === previous.id);
    if (idx !== -1) {
      state.shoes[idx] = {
        ...previous,
        status: ShoeStatus.ARCHIVED,
        updatedAt: next.createdAt,
      };
    }
    state.shoes.push(next);
    state.rounds[next.id] = [];
    await this.write(state);
    return { shoe: next, rounds: [] };
  }
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

// NOTE: `createHistoryStore` lives in the platform-specific `./create-store`
// module (with a `.web.ts` variant) so the native expo-sqlite adapter and its
// wa-sqlite wasm are NEVER pulled into the web bundle.

export function newShoeRecord(now: string = new Date().toISOString()): ShoeRecord {
  const id = `shoe-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return {
    id,
    label: null,
    environment: SessionEnvironment.HISTORY_INPUT,
    status: ShoeStatus.ACTIVE,
    roundCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function clearRevision(shoeId: string, now: string): RevisionRecord {
  return {
    id: `rev-${shoeId}-clear-${now}`,
    shoeId,
    roundNumber: null,
    action: 'DELETE',
    before: null,
    after: null,
    createdAt: now,
  };
}
