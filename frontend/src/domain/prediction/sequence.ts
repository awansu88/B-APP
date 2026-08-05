import { Outcome } from '../models/outcome';
import { PredictionDecision } from './decision';

/**
 * The evaluation of a single locked recommendation against its actual result
 * (TYPE ONLY in Milestone 0).
 *  - WIN / LOSS: the recommended side won / lost.
 *  - PUSH:       a Tie occurred on a Player/Banker recommendation.
 *  - SKIP:       the decision was SKIP.
 */
export enum StepEvaluation {
  WIN = 'WIN',
  LOSS = 'LOSS',
  PUSH = 'PUSH',
  SKIP = 'SKIP',
}

/** The running state of a three-win sequence (shape only). */
export interface SequenceState {
  readonly consecutiveWins: number;
  readonly achieved: boolean;
  readonly failed: boolean;
}

/**
 * MILESTONE 0 PLACEHOLDER — NOT IMPLEMENTED and NOT wired to any screen.
 * Step scoring (including Tie-as-PUSH) is future-milestone work.
 */
export function evaluateStep(
  _decision: PredictionDecision,
  _actual: Outcome,
): StepEvaluation {
  throw new Error(
    'evaluateStep is not implemented in Milestone 0 (bootstrap).',
  );
}

/**
 * MILESTONE 0 PLACEHOLDER — NOT IMPLEMENTED and NOT wired to any screen.
 * Three-win sequence evaluation is future-milestone work.
 */
export function evaluateThreeWinSequence(
  _steps: readonly StepEvaluation[],
): SequenceState {
  throw new Error(
    'evaluateThreeWinSequence is not implemented in Milestone 0 (bootstrap).',
  );
}
