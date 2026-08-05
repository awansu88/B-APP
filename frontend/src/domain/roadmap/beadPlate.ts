import { MIN_WARMUP_NON_TIE } from '../../config/engine';
import { Outcome } from '../models/outcome';
import { PairStatus } from '../models/pair';
import type { RoundRecord } from '../models/round';

/** The Bead Plate has a fixed height of 6 rows; it fills column by column. */
export const BEAD_PLATE_ROWS = 6;

/** A single reconstructed cell of the Bead Plate roadmap. */
export interface BeadCell {
  readonly row: number;
  readonly col: number;
  readonly outcome: Outcome;
  readonly playerPair: PairStatus;
  readonly bankerPair: PairStatus;
  readonly roundId: string;
}

/** Rounds sorted by their intra-shoe index (defensive copy — pure). */
const orderedByIndex = (rounds: readonly RoundRecord[]): RoundRecord[] =>
  [...rounds].sort((a, b) => a.index - b.index);

/**
 * Reconstruct the Bead Plate purely from raw rounds (Project Principle #2).
 * Cells are laid out column-major over a fixed 6-row grid.
 */
export function reconstructBeadPlate(
  rounds: readonly RoundRecord[],
): BeadCell[] {
  return orderedByIndex(rounds).map((round, position) => ({
    row: position % BEAD_PLATE_ROWS,
    col: Math.floor(position / BEAD_PLATE_ROWS),
    outcome: round.outcome,
    playerPair: round.playerPair,
    bankerPair: round.bankerPair,
    roundId: round.id,
  }));
}

/** Count of non-Tie results — the warm-up metric. */
export function countNonTie(rounds: readonly RoundRecord[]): number {
  return rounds.filter((r) => r.outcome !== Outcome.TIE).length;
}

/** True once the minimum warm-up of non-Tie results is reached. */
export function isWarmedUp(rounds: readonly RoundRecord[]): boolean {
  return countNonTie(rounds) >= MIN_WARMUP_NON_TIE;
}
