/**
 * Milestone 6 — read-only integrity diagnostics (PURE).
 *
 * Non-destructive checks over a BappDataset projection. Diagnostics NEVER
 * mutate data and NEVER auto-repair in Milestone 6.
 */
import type { BappDataset } from '../backup/dataset';

export interface IntegrityCheck {
  readonly id: string;
  readonly label: string;
  readonly ok: boolean;
  /** A human-readable value (count / status). */
  readonly detail: string;
}

export interface IntegrityReport {
  readonly schemaVersion: string;
  readonly shoeCount: number;
  readonly roundCount: number;
  readonly lockedPredictionCount: number;
  readonly invalidatedPredictionCount: number;
  readonly checks: readonly IntegrityCheck[];
  readonly ok: boolean;
}

export interface IntegrityOptions {
  readonly schemaVersion: string;
}

/** Compute a read-only integrity report from a dataset projection. */
export function checkIntegrity(dataset: BappDataset, opts: IntegrityOptions): IntegrityReport {
  const shoeIds = new Set(dataset.shoes.map((s) => s.id));

  // orphan rounds (round.shoeId not present in shoes)
  const orphanRounds = dataset.rounds.filter((r) => !shoeIds.has(r.shoeId));

  // broken revision links (revision.shoeId not present in shoes)
  const orphanRevisions = dataset.revisions.filter((r) => !shoeIds.has(r.shoeId));

  // orphan locked predictions
  const orphanLpe = dataset.lockedPredictions.filter((p) => !shoeIds.has(p.shoeId));

  // duplicate valid locks (more than one non-invalidated lock per shoe + target)
  const validCounts = new Map<string, number>();
  for (const p of dataset.lockedPredictions) {
    if (p.invalidated) continue;
    const key = `${p.shoeId}::${p.targetRoundNumber}`;
    validCounts.set(key, (validCounts.get(key) ?? 0) + 1);
  }
  const duplicateValidLocks = [...validCounts.values()].filter((n) => n > 1).length;

  // round-number continuity per shoe (1..n, unique)
  const byShoe = new Map<string, number[]>();
  for (const r of dataset.rounds) {
    const list = byShoe.get(r.shoeId) ?? [];
    list.push(r.roundNumber);
    byShoe.set(r.shoeId, list);
  }
  let discontinuities = 0;
  for (const numbers of byShoe.values()) {
    const sorted = [...numbers].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i += 1) {
      if (sorted[i] !== i + 1) {
        discontinuities += 1;
        break;
      }
    }
  }

  const invalidatedPredictionCount = dataset.lockedPredictions.filter((p) => p.invalidated).length;

  const checks: IntegrityCheck[] = [
    { id: 'orphan-rounds', label: 'Orphan rounds', ok: orphanRounds.length === 0, detail: String(orphanRounds.length) },
    { id: 'broken-revisions', label: 'Broken revision links', ok: orphanRevisions.length === 0, detail: String(orphanRevisions.length) },
    { id: 'orphan-locks', label: 'Orphan locked predictions', ok: orphanLpe.length === 0, detail: String(orphanLpe.length) },
    { id: 'duplicate-valid-locks', label: 'Duplicate valid locks', ok: duplicateValidLocks === 0, detail: String(duplicateValidLocks) },
    { id: 'round-continuity', label: 'Round-number continuity', ok: discontinuities === 0, detail: discontinuities === 0 ? 'OK' : `${discontinuities} shoe(s) non-contiguous` },
  ];

  return {
    schemaVersion: opts.schemaVersion,
    shoeCount: dataset.shoes.length,
    roundCount: dataset.rounds.length,
    lockedPredictionCount: dataset.lockedPredictions.length,
    invalidatedPredictionCount,
    checks,
    ok: checks.every((c) => c.ok),
  };
}
