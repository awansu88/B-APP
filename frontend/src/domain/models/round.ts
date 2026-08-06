import { RoundSource } from './enums';
import { Winner } from './outcome';
import { PairState } from './pair';

/**
 * RoundRecord — the raw, immutable source of truth (Project Principle #1).
 *
 * Roadmaps, features, analyzers and predictions are ALL reconstructable from an
 * ordered sequence of RoundRecords (Principle #2). Nothing else is
 * authoritative. `shoeId` + `roundNumber` is unique.
 */
export interface RoundRecord {
  readonly id: string;
  readonly shoeId: string;
  /** 1-based position of this round within its shoe. */
  readonly roundNumber: number;
  readonly winner: Winner;
  readonly playerPair: PairState;
  readonly bankerPair: PairState;
  readonly source: RoundSource;
  /** ISO-8601 timestamp. */
  readonly createdAt: string;
}
