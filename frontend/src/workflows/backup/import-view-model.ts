/**
 * M7.2 Patch 2 — PURE import view-model for the Export/Import screen.
 *
 * Derives the file-import UI state machine from an `ImportInspection` and the
 * runtime write capability, so every presentation state is deterministically
 * unit-testable WITHOUT a filesystem (Section 21):
 *   IDLE -> (choose file) -> VALID | INVALID
 * plus the merge/restore availability + destructive-restore gating.
 */
import type { ImportInspection } from '@/src/domain/backup';

export type ImportPhase = 'IDLE' | 'VALID' | 'INVALID';

export interface ImportView {
  readonly phase: ImportPhase;
  readonly fileName: string | null;
  readonly inspection: ImportInspection | null;
  /** Merge apply is offered only for a valid, conflict-free plan on a writable runtime. */
  readonly mergeReady: boolean;
  /** Restore is offered only for a valid FULL_BACKUP on a writable runtime. */
  readonly restoreReady: boolean;
  /** Restore permanently REPLACES local data — always surfaced as destructive. */
  readonly restoreDestructive: boolean;
}

export const idleImportView = (): ImportView => ({
  phase: 'IDLE',
  fileName: null,
  inspection: null,
  mergeReady: false,
  restoreReady: false,
  restoreDestructive: true,
});

/** Pure: derive the import view from an inspection + runtime write capability. */
export function deriveImportView(inspection: ImportInspection, canWrite: boolean): ImportView {
  if (!inspection.ok || !inspection.parsed) {
    return {
      phase: 'INVALID',
      fileName: inspection.summary.fileName,
      inspection,
      mergeReady: false,
      restoreReady: false,
      restoreDestructive: true,
    };
  }
  const kind = inspection.parsed.meta.kind;
  return {
    phase: 'VALID',
    fileName: inspection.summary.fileName,
    inspection,
    mergeReady: Boolean(inspection.plan?.safe) && canWrite,
    restoreReady: kind === 'FULL_BACKUP' && canWrite,
    restoreDestructive: true,
  };
}
