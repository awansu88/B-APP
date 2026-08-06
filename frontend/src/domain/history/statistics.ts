/**
 * Shoe statistics derived purely from the raw ordered rounds.
 *
 * PURE TypeScript — no React / RN / Expo / SQLite / UI imports. Everything is
 * reconstructable from the raw `RoundRecord[]` (Project Principle #2).
 */
import { Winner } from '../models/outcome';
import type { RoundRecord } from '../models/round';

export interface ShoeStatistics {
  /** Every recorded round (including ties). */
  readonly totalRounds: number;
  /** Player + Banker results (ties excluded) — the warm-up counter. */
  readonly nonTieRounds: number;
  readonly playerTotal: number;
  readonly tieTotal: number;
  readonly bankerTotal: number;
}

/** Count winners across the ordered raw rounds. */
export function computeStatistics(
  rounds: readonly RoundRecord[],
): ShoeStatistics {
  let playerTotal = 0;
  let tieTotal = 0;
  let bankerTotal = 0;

  for (const round of rounds) {
    switch (round.winner) {
      case Winner.PLAYER:
        playerTotal += 1;
        break;
      case Winner.BANKER:
        bankerTotal += 1;
        break;
      case Winner.TIE:
        tieTotal += 1;
        break;
    }
  }

  return {
    totalRounds: rounds.length,
    nonTieRounds: playerTotal + bankerTotal,
    playerTotal,
    tieTotal,
    bankerTotal,
  };
}
