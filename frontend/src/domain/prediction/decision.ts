/**
 * Prediction decisions the engine may emit.
 *  - BET_PLAYER / BET_BANKER: a directional recommendation.
 *  - SKIP: no recommendation this round.
 */
export enum PredictionDecision {
  BET_PLAYER = 'BET_PLAYER',
  BET_BANKER = 'BET_BANKER',
  SKIP = 'SKIP',
}
