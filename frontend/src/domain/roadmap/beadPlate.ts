import { Outcome } from '../models/outcome';
import { PairStatus } from '../models/pair';
import type { RoundRecord } from '../models/round';

/**
 * Locked layout constant: the Bead Plate has a fixed height of 6 rows.
 * (Constant only — no reconstruction is implemented in Milestone 0.)
 */
export const BEAD_PLATE_ROWS = 6;

/**
 * Domain type for a reconstructed Bead Plate cell (shape only).
 * The actual reconstruction is deferred to a later milestone.
 */
export interface BeadCell {
  readonly row: number;
  readonly col: number;
  readonly outcome: Outcome;
  readonly playerPair: PairStatus;
  readonly bankerPair: PairStatus;
  readonly roundId: string;
}

/**
 * MILESTONE 0 PLACEHOLDER — NOT IMPLEMENTED and NOT wired to any screen.
 *
 * Roadmap reconstruction from raw rounds is future-milestone work. This is kept
 * as an explicit non-runtime placeholder purely to document the seam; it throws
 * if ever executed so nothing can silently rely on unfinished logic.
 */
export function reconstructBeadPlate(_rounds: readonly RoundRecord[]): BeadCell[] {
  throw new Error(
    'reconstructBeadPlate is not implemented in Milestone 0 (bootstrap).',
  );
}
