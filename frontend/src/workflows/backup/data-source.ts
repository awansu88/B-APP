/**
 * Milestone 6 — authoritative data-source seam for Statistics / Export /
 * Import-Merge / Restore / Diagnostics.
 *
 * Two runtimes implement ONE contract (Metro picks `.web.ts` on web):
 *   - native: real SQLite/DB-002 transactional read + Merge/Restore apply.
 *   - web preview: read-only projection of the existing AsyncStorage stores;
 *     destructive writes (Merge/Restore apply) throw `WriteUnavailableError`
 *     so the UI never pretends a write succeeded.
 *
 * The shared PURE validation / merge-planning domain (`src/domain/backup/*`) is
 * used by BOTH runtimes — merge rules are never duplicated in the adapters.
 */
import type { BappDataset, BappExport } from '@/src/domain/backup';
import type { MergePlan } from '@/src/domain/backup/merge';

export type RuntimeKind = 'native-sqlite' | 'web-preview';

export interface RestoreSummary {
  readonly shoes: number;
  readonly rounds: number;
  readonly revisions: number;
  readonly lockedPredictions: number;
  readonly sessionStates: number;
}

/**
 * Raised when a destructive write (Merge apply / Restore) is attempted on a
 * runtime that cannot durably/transactionally persist it (web preview).
 */
export class WriteUnavailableError extends Error {
  constructor() {
    super('Available on native SQLite runtime');
    this.name = 'WriteUnavailableError';
  }
}

export interface DataSource {
  readonly runtime: RuntimeKind;
  /** Whether transactional Merge/Restore writes are available on this runtime. */
  readonly canWrite: boolean;
  /** Read the authoritative dataset projection (read-only). */
  loadDataset(): Promise<BappDataset>;
  /** Apply a safe merge plan transactionally (throws on web preview). */
  applyMerge(plan: MergePlan): Promise<void>;
  /** Destructively restore a FULL_BACKUP transactionally (throws on web preview). */
  restore(exp: BappExport): Promise<RestoreSummary>;
}
