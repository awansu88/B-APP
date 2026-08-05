/**
 * Session environments define how rounds are entered / evaluated.
 *  - HISTORY_INPUT:    bulk entry of past shoes for analysis.
 *  - LIVE_FORWARD:     real-time round-by-round entry at the table.
 *  - HISTORICAL_TEST:  replay of stored shoes against a locked config batch.
 */
export enum SessionEnvironment {
  HISTORY_INPUT = 'HISTORY_INPUT',
  LIVE_FORWARD = 'LIVE_FORWARD',
  HISTORICAL_TEST = 'HISTORICAL_TEST',
}
