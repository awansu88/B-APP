/**
 * Snapshot module (Milestone 0: contract only, no logic).
 *
 * A snapshot is a derived, reconstructable projection of the raw rounds at a
 * given point in a shoe. It is NOT authoritative — raw rounds are (Principle #1).
 */
import type { RoundRecord } from '../models/round';

export interface ShoeSnapshot {
  readonly shoeId: string;
  readonly roundCount: number;
  readonly nonTieCount: number;
  readonly generatedAt: string;
}

/** Milestone 0 placeholder — full snapshot assembly arrives in a later milestone. */
export type SnapshotSource = readonly RoundRecord[];

// Milestone 3: the immutable ShoeStateSnapshot builder.
export * from './shoe-snapshot';
