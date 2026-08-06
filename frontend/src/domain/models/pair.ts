/**
 * Pair status for optional Player Pair / Banker Pair side information.
 * UNKNOWN is first-class: many historical records do not capture pairs.
 */
export enum PairState {
  YES = 'YES',
  NO = 'NO',
  UNKNOWN = 'UNKNOWN',
}

// Backwards-compatible alias retained from Milestone 0 (`PairStatus === PairState`).
export { PairState as PairStatus };
