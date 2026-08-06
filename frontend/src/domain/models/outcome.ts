/**
 * The winner of a baccarat round — the only three valid results.
 * UI colour mapping: PLAYER = blue, BANKER = red, TIE = green
 * (see `src/domain/roadmap/types.ts` → `RoadmapColor`).
 */
export enum Winner {
  PLAYER = 'PLAYER',
  TIE = 'TIE',
  BANKER = 'BANKER',
}

/** Canonical UI ordering: Player / Tie / Banker. */
export const UI_OUTCOME_ORDER: readonly Winner[] = Object.freeze([
  Winner.PLAYER,
  Winner.TIE,
  Winner.BANKER,
]);

// Backwards-compatible alias retained from Milestone 0 (`Outcome === Winner`).
export { Winner as Outcome };
