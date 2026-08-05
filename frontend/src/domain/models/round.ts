import { Outcome } from './outcome';
import { PairStatus } from './pair';

/**
 * RoundRecord — the raw, immutable source of truth (Project Principle #1).
 *
 * Roadmaps, features, analyzers and predictions are ALL reconstructable from a
 * sequence of RoundRecords (Project Principle #2). Nothing else is authoritative.
 */
export interface RoundRecord {
  /** Stable unique id for this round. */
  readonly id: string;
  /** The shoe this round belongs to. */
  readonly shoeId: string;
  /** Zero-based position of this round within its shoe. */
  readonly index: number;
  /** The result of the round. */
  readonly outcome: Outcome;
  /** Player Pair status (YES / NO / UNKNOWN). */
  readonly playerPair: PairStatus;
  /** Banker Pair status (YES / NO / UNKNOWN). */
  readonly bankerPair: PairStatus;
  /** ISO-8601 timestamp of when the round was recorded. */
  readonly createdAt: string;
}
