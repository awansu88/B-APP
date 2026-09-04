import { PredictionDecision } from '@/src/domain/models/enums';
import { deriveDirectionalLean, LeanSide } from '@/src/domain/observability';
import type { LockedPrediction } from '@/src/domain/session';

export interface CompactLiveView {
  readonly recommendation: 'BET PLAYER' | 'BET BANKER' | 'SKIP' | 'WAITING';
  readonly lean: LeanSide | null;
}

const DECISION_LABEL: Record<PredictionDecision, CompactLiveView['recommendation']> = {
  [PredictionDecision.BET_PLAYER]: 'BET PLAYER',
  [PredictionDecision.BET_BANKER]: 'BET BANKER',
  [PredictionDecision.SKIP]: 'SKIP',
};

/** Presentation-only projection of immutable accepted prediction fields. */
export function compactLiveView(prediction: LockedPrediction | null): CompactLiveView {
  if (!prediction) return { recommendation: 'WAITING', lean: null };
  return {
    recommendation: DECISION_LABEL[prediction.decision],
    lean: deriveDirectionalLean(prediction.playerScore, prediction.bankerScore).side,
  };
}
