/**
 * Round outcome — the only three valid results of a baccarat round.
 * UI must present these in the order P / T / B (see UI_OUTCOME_ORDER).
 */
export enum Outcome {
  PLAYER = 'PLAYER',
  TIE = 'TIE',
  BANKER = 'BANKER',
}

/** Canonical UI ordering: Player / Tie / Banker. */
export const UI_OUTCOME_ORDER: readonly Outcome[] = Object.freeze([
  Outcome.PLAYER,
  Outcome.TIE,
  Outcome.BANKER,
]);

/** A Tie neither advances nor breaks a recommendation sequence. */
export const isTie = (outcome: Outcome): boolean => outcome === Outcome.TIE;
