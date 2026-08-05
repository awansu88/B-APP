/**
 * Pair status for optional Player Pair / Banker Pair side information.
 * UNKNOWN is a first-class value: many historical records do not capture pairs.
 */
export enum PairStatus {
  YES = 'YES',
  NO = 'NO',
  UNKNOWN = 'UNKNOWN',
}
