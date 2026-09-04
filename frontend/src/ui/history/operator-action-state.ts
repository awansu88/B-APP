import { OperatorAction } from '@/src/domain/session';

/** Pure projection used by the compact controls to keep both toggles coherent. */
export function operatorActionControlState(
  action: OperatorAction,
  skipLocked: boolean,
): { playedActive: boolean; notPlayedActive: boolean; playedDisabled: boolean } {
  return {
    playedActive: action === OperatorAction.PLAYED && !skipLocked,
    notPlayedActive: action === OperatorAction.NOT_PLAYED || skipLocked,
    playedDisabled: skipLocked,
  };
}
