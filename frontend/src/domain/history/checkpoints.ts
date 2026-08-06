/**
 * History checkpoint + warm-up rules (pure).
 *
 * No React / RN / Expo / SQLite / UI imports.
 */
import { Winner } from '../models/outcome';
import type { RoundRecord } from '../models/round';

/**
 * Minimum PLAYER/BANKER (non-Tie) results required before the forward-testing
 * modes (Start Live / Start Historical Test) may be started (MVP_SPEC).
 */
export const MIN_NON_TIE_RESULTS = 8;

/** The fixed early checkpoints, before the every-10 cadence begins. */
export const FIXED_CHECKPOINTS: readonly number[] = Object.freeze([15, 20, 30]);

/** After round 30 a checkpoint is shown on every additional 10 rounds. */
export const RECURRING_CHECKPOINT_START = 30;
export const RECURRING_CHECKPOINT_STEP = 10;

/**
 * A non-blocking history checkpoint is due at rounds 15, 20, 30, and then every
 * additional 10 rounds (40, 50, 60, ...). Note: 25 is NOT a checkpoint.
 */
export function isCheckpointRound(totalRounds: number): boolean {
  if (FIXED_CHECKPOINTS.includes(totalRounds)) return true;
  return (
    totalRounds > RECURRING_CHECKPOINT_START &&
    (totalRounds - RECURRING_CHECKPOINT_START) % RECURRING_CHECKPOINT_STEP === 0
  );
}

/** Count PLAYER/BANKER results (ties excluded). */
export function nonTieCount(rounds: readonly RoundRecord[]): number {
  let n = 0;
  for (const round of rounds) {
    if (round.winner !== Winner.TIE) n += 1;
  }
  return n;
}

/**
 * Whether the forward modes may be started: at least `MIN_NON_TIE_RESULTS`
 * non-Tie results have been recorded.
 */
export function canStartForwardModes(rounds: readonly RoundRecord[]): boolean {
  return nonTieCount(rounds) >= MIN_NON_TIE_RESULTS;
}

/** How many more non-Tie results are needed to unlock forward modes. */
export function nonTieResultsRemaining(rounds: readonly RoundRecord[]): number {
  return Math.max(0, MIN_NON_TIE_RESULTS - nonTieCount(rounds));
}
