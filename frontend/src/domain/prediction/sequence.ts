import { THREE_WIN_TARGET } from '../../config/engine';
import { Outcome } from '../models/outcome';
import { PredictionDecision } from './decision';

/**
 * The evaluation of a single locked recommendation against its actual result.
 *  - WIN:  the recommended side won.
 *  - LOSS: the recommended side lost.
 *  - PUSH: a Tie occurred on a Player/Banker recommendation (neither advances
 *          nor breaks the sequence).
 *  - SKIP: the decision was SKIP (neither advances nor breaks the sequence).
 */
export enum StepEvaluation {
  WIN = 'WIN',
  LOSS = 'LOSS',
  PUSH = 'PUSH',
  SKIP = 'SKIP',
}

/**
 * Evaluate one locked decision against the actual outcome.
 * Tie is a PUSH for Player/Banker recommendations.
 */
export function evaluateStep(
  decision: PredictionDecision,
  actual: Outcome,
): StepEvaluation {
  if (decision === PredictionDecision.SKIP) {
    return StepEvaluation.SKIP;
  }
  if (actual === Outcome.TIE) {
    return StepEvaluation.PUSH;
  }
  const predicted =
    decision === PredictionDecision.BET_PLAYER
      ? Outcome.PLAYER
      : Outcome.BANKER;
  return actual === predicted ? StepEvaluation.WIN : StepEvaluation.LOSS;
}

/** The running state of a three-win sequence within a single shoe. */
export interface SequenceState {
  /** Current streak of consecutive recommendation wins. */
  readonly consecutiveWins: number;
  /** True once THREE_WIN_TARGET consecutive wins are reached. */
  readonly achieved: boolean;
  /** True if at least one LOSS broke a sequence before it was achieved. */
  readonly failed: boolean;
}

/**
 * Fold a series of step evaluations into a three-win sequence result.
 *
 * Rules (LOCKED):
 *  - Three consecutive WINs achieve the target.
 *  - LOSS fails (resets) the current sequence.
 *  - SKIP and PUSH (Tie) neither advance nor break the sequence.
 *  - Evaluation stops as soon as the target is achieved.
 *
 * Callers MUST pass steps from a single shoe (a three-win target must occur
 * within the same shoe).
 */
export function evaluateThreeWinSequence(
  steps: readonly StepEvaluation[],
): SequenceState {
  let consecutiveWins = 0;
  let failed = false;

  for (const step of steps) {
    if (step === StepEvaluation.WIN) {
      consecutiveWins += 1;
      if (consecutiveWins >= THREE_WIN_TARGET) {
        return { consecutiveWins, achieved: true, failed };
      }
    } else if (step === StepEvaluation.LOSS) {
      if (consecutiveWins > 0) {
        failed = true;
      }
      consecutiveWins = 0;
    }
    // SKIP and PUSH intentionally do nothing.
  }

  return { consecutiveWins, achieved: false, failed };
}
