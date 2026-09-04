import { PredictionDecision } from '@/src/domain/models/enums';
import { OperatorAction } from '@/src/domain/session';

/** Keep carried operator intent for bets, but a locked SKIP is always watched. */
export function operatorActionForDecision(
  action: OperatorAction,
  decision: PredictionDecision,
): OperatorAction {
  return decision === PredictionDecision.SKIP ? OperatorAction.NOT_PLAYED : action;
}
