/**
 * Pair-input mode + draft model for the History Input workflow.
 *
 * PURE TypeScript — no React / React Native / Expo / SQLite / UI imports.
 *
 * Two ways a shoe's optional Player Pair / Banker Pair side information is
 * captured while entering results:
 *  - COMPLETE:  an unselected PP/BP means a definite NO (the operator is
 *               recording every pair, so "not ticked" == "did not occur").
 *  - PARTIAL:   an unselected PP/BP means UNKNOWN (historical records that did
 *               not reliably capture pairs).
 */
import { PairState } from '../models/pair';

/** How unselected PP/BP toggles are interpreted when a result is saved. */
export enum PairInputMode {
  COMPLETE = 'COMPLETE',
  PARTIAL = 'PARTIAL',
}

/**
 * Resolve a UI toggle (selected / not selected) into a concrete `PairState`
 * given the active pair-input mode.
 *  - selected            -> YES
 *  - unselected COMPLETE  -> NO
 *  - unselected PARTIAL   -> UNKNOWN
 */
export function resolvePairState(
  selected: boolean,
  mode: PairInputMode,
): PairState {
  if (selected) return PairState.YES;
  return mode === PairInputMode.COMPLETE ? PairState.NO : PairState.UNKNOWN;
}

/** The transient input draft for the next round to be saved. */
export interface InputDraft {
  readonly playerPairSelected: boolean;
  readonly bankerPairSelected: boolean;
  readonly pairMode: PairInputMode;
}

/** A fresh draft (nothing selected) for the given pair-input mode. */
export function emptyDraft(mode: PairInputMode = PairInputMode.PARTIAL): InputDraft {
  return { playerPairSelected: false, bankerPairSelected: false, pairMode: mode };
}

/**
 * Reset the pair toggles after a result is saved. The pair-input MODE is
 * intentionally preserved (it is a shoe-wide setting); only PP/BP selections
 * are cleared so the next round starts fresh.
 */
export function resetDraft(draft: InputDraft): InputDraft {
  return {
    playerPairSelected: false,
    bankerPairSelected: false,
    pairMode: draft.pairMode,
  };
}

/** Toggle the Player-Pair selection. */
export function togglePlayerPair(draft: InputDraft): InputDraft {
  return { ...draft, playerPairSelected: !draft.playerPairSelected };
}

/** Toggle the Banker-Pair selection. */
export function toggleBankerPair(draft: InputDraft): InputDraft {
  return { ...draft, bankerPairSelected: !draft.bankerPairSelected };
}

/** Switch the pair-input mode (clears selections to avoid ambiguity). */
export function setPairMode(draft: InputDraft, mode: PairInputMode): InputDraft {
  return { playerPairSelected: false, bankerPairSelected: false, pairMode: mode };
}
