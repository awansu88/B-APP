/**
 * Milestone 5 — session engine primitives: prediction locking, evaluation, and
 * the three-win tracker. Pure and deterministic (all time/ids injected).
 */
import { deepFreeze } from '../analysis/helpers';
import { runAnalysis } from '../analysis';
import { runDecisionPipeline, DECISION_CONFIG } from '../decision';
import { TransitionState } from '../features/feature-extraction';
import { buildShoeStateSnapshot } from '../snapshot';
import { extractFeatures } from '../features';
import { PredictionDecision } from '../models/enums';
import type { RoundRecord } from '../models/round';
import { Winner } from '../models/outcome';
import { SessionEnvironment } from './environment';
import {
  ALL_PROFILES,
  LockedPrediction,
  PROFILE_CATEGORIES,
  ProfileSequenceMap,
  SequenceState,
  SessionProfile,
  StepResult,
} from './types';
import type { PredictionCategory } from '../models/enums';

export interface ComputeOptions {
  readonly now?: string;
  readonly historyConfirmed?: boolean;
}

/**
 * Build a LOCKED prediction for the NEXT target round from the completed rounds.
 * Only completed rounds are used, so no future result can enter the snapshot.
 */
export function computePrediction(
  rounds: readonly RoundRecord[],
  environment: SessionEnvironment,
  shoeId: string,
  opts: ComputeOptions = {},
): LockedPrediction {
  const historyConfirmed = opts.historyConfirmed ?? false;
  const now = opts.now ?? new Date().toISOString();
  const targetRound = rounds.length + 1;

  const snapshot = buildShoeStateSnapshot(rounds, { historyConfirmed });
  const features = extractFeatures(rounds, { historyConfirmed });
  const ctx = { snapshot, features };
  const report = runAnalysis(ctx);
  const decision = runDecisionPipeline(ctx, DECISION_CONFIG);

  return deepFreeze<LockedPrediction>({
    id: `pred-${shoeId}-r${targetRound}-${now}`,
    shoeId,
    targetRound,
    environment,
    decision: decision.active.decision,
    side: decision.active.side,
    confidence: decision.active.confidence,
    category: decision.active.category,
    moduleResults: report.results,
    riskFlags: decision.active.riskFlags,
    playerScore: decision.playerScore,
    bankerScore: decision.bankerScore,
    weightedAgreement: decision.weightedAgreement,
    conflictScore: decision.conflictScore,
    votingVersion: decision.votingVersion,
    confidenceVersion: decision.confidenceVersion,
    riskVersion: decision.riskVersion,
    engineVersion: decision.engineVersion,
    configVersion: decision.configVersion,
    decisionConfigVersion: decision.decisionConfigVersion,
    snapshotVersion: snapshot.snapshotVersion,
    featureVersion: features.featureVersion,
    lockedAt: now,
    locked: true,
  });
}

// Referenced only to assert the regime signal source stays stable.
void TransitionState;

/** Evaluate a locked prediction against the actual round outcome. */
export function evaluatePrediction(
  prediction: LockedPrediction,
  actual: Winner,
  opts: { revisionAffected?: boolean } = {},
): StepResult {
  if (opts.revisionAffected) return StepResult.INVALIDATED;
  if (prediction.decision === PredictionDecision.SKIP) return StepResult.SKIPPED;
  if (actual === Winner.TIE) return StepResult.PUSH;
  if (prediction.decision === PredictionDecision.BET_PLAYER) {
    return actual === Winner.PLAYER ? StepResult.WIN : StepResult.LOSS;
  }
  if (prediction.decision === PredictionDecision.BET_BANKER) {
    return actual === Winner.BANKER ? StepResult.WIN : StepResult.LOSS;
  }
  return StepResult.SKIPPED;
}

// --- three-win tracker -----------------------------------------------------

export const initialSequence = (): SequenceState => ({
  consecutiveWins: 0,
  achieved: false,
  completions: 0,
});

export const initialProfileSequences = (): ProfileSequenceMap =>
  ({
    [SessionProfile.EXPERIMENTAL_PLUS]: initialSequence(),
    [SessionProfile.QUALIFIED_PLUS]: initialSequence(),
    [SessionProfile.HIGH_ONLY]: initialSequence(),
  });

/**
 * Advance one profile's three-win tracker.
 * - Only in-profile categories with a WIN/LOSS count.
 * - WIN advances (3 in a row completes and resets the streak).
 * - LOSS resets the streak. SKIPPED / PUSH / INVALIDATED / out-of-profile: no-op.
 */
export function advanceSequence(
  state: SequenceState,
  result: StepResult,
  category: PredictionCategory,
  profile: SessionProfile,
): SequenceState {
  const counts = PROFILE_CATEGORIES[profile].includes(category);
  if (!counts) return state;
  if (result === StepResult.WIN) {
    const cw = state.consecutiveWins + 1;
    if (cw >= 3) {
      return { consecutiveWins: 0, achieved: true, completions: state.completions + 1 };
    }
    return { ...state, consecutiveWins: cw };
  }
  if (result === StepResult.LOSS) {
    return { ...state, consecutiveWins: 0 };
  }
  return state;
}

export function advanceProfileMap(
  map: ProfileSequenceMap,
  result: StepResult,
  category: PredictionCategory,
): ProfileSequenceMap {
  const next = { ...map } as Record<SessionProfile, SequenceState>;
  for (const p of ALL_PROFILES) {
    next[p] = advanceSequence(map[p], result, category, p);
  }
  return next;
}
