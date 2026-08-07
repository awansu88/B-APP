/**
 * Milestone 5 — Live Workflow & Session Tracker tests (deterministic).
 *
 * Pure primitives (evaluation, three-win, profiles) are tested with synthetic
 * locked predictions; the workflow + persistence are tested with real all-Banker
 * sessions (the engine reliably recommends BET_BANKER for a banker-dominated shoe).
 */
import { PredictionCategory, PredictionDecision, RoundSource } from '@/src/domain/models/enums';
import { Winner } from '@/src/domain/models/outcome';
import { PairState } from '@/src/domain/models/pair';
import type { RoundRecord } from '@/src/domain/models/round';
import { VoteSide } from '@/src/domain/decision';
import {
  DuplicateResultError,
  InsufficientHistoryError,
  OperatorAction,
  SessionEnvironment,
  SessionProfile,
  StepResult,
  TargetRoundError,
  WorkflowState,
  advanceProfileMap,
  advanceSequence,
  editHistory,
  evaluatePrediction,
  initialSequence,
  newShoe,
  reconstructSession,
  serializeSession,
  startSession,
  submitResult,
  type LockedPrediction,
} from '@/src/domain/session';

const NOW = '2026-01-01T00:00:00.000Z';

function bankerRounds(n: number, shoeId = 'shoe-m5'): RoundRecord[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${shoeId}-h${i + 1}`,
    shoeId,
    roundNumber: i + 1,
    winner: Winner.BANKER,
    playerPair: PairState.NO,
    bankerPair: PairState.NO,
    source: RoundSource.HISTORY,
    createdAt: NOW,
  }));
}

function fakePrediction(
  decision: PredictionDecision,
  category: PredictionCategory,
  targetRound = 1,
): LockedPrediction {
  const side =
    decision === PredictionDecision.BET_PLAYER
      ? VoteSide.PLAYER
      : decision === PredictionDecision.BET_BANKER
        ? VoteSide.BANKER
        : null;
  return {
    id: `fake-r${targetRound}`,
    shoeId: 'shoe-fake',
    targetRound,
    environment: SessionEnvironment.LIVE_FORWARD,
    decision,
    side,
    confidence: 0.65,
    category,
    moduleResults: [],
    riskFlags: [],
    playerScore: 0,
    bankerScore: 0,
    weightedAgreement: 0,
    conflictScore: 0,
    votingVersion: 'VOTE-001',
    confidenceVersion: 'CONF-001',
    riskVersion: 'RISK-001',
    engineVersion: 'ENGINE-001',
    configVersion: 'CFG-001',
    decisionConfigVersion: 'DECISION-001',
    snapshotVersion: 'SNAPSHOT-001',
    featureVersion: 'FEATURE-001',
    lockedAt: NOW,
    locked: true,
  };
}

const start = (env = SessionEnvironment.LIVE_FORWARD, n = 12) =>
  startSession(bankerRounds(n), env, { now: NOW, historyConfirmed: true });

// ===========================================================================
// EVALUATION (WIN / LOSS / PUSH / SKIPPED / INVALIDATED)
// ===========================================================================
describe('session — evaluation', () => {
  const betB = fakePrediction(PredictionDecision.BET_BANKER, PredictionCategory.QUALIFIED);
  const skip = fakePrediction(PredictionDecision.SKIP, PredictionCategory.BELOW_THRESHOLD);

  it('WIN on a correct directional call', () => {
    expect(evaluatePrediction(betB, Winner.BANKER)).toBe(StepResult.WIN);
  });
  it('LOSS on an incorrect directional call', () => {
    expect(evaluatePrediction(betB, Winner.PLAYER)).toBe(StepResult.LOSS);
  });
  it('PUSH on an actual Tie', () => {
    expect(evaluatePrediction(betB, Winner.TIE)).toBe(StepResult.PUSH);
  });
  it('SKIPPED on an official SKIP', () => {
    expect(evaluatePrediction(skip, Winner.BANKER)).toBe(StepResult.SKIPPED);
  });
  it('INVALIDATED when the prediction was revision-affected', () => {
    expect(evaluatePrediction(betB, Winner.BANKER, { revisionAffected: true })).toBe(
      StepResult.INVALIDATED,
    );
  });
});

// ===========================================================================
// THREE-WIN TRACKER (primary definition + profiles)
// ===========================================================================
describe('session — three-win tracker', () => {
  const Q = PredictionCategory.QUALIFIED;
  const step = (s: ReturnType<typeof initialSequence>, r: StepResult, cat = Q) =>
    advanceSequence(s, r, cat, SessionProfile.EXPERIMENTAL_PLUS);

  it('three consecutive wins completes the sequence', () => {
    let s = initialSequence();
    s = step(s, StepResult.WIN);
    s = step(s, StepResult.WIN);
    expect(s.consecutiveWins).toBe(2);
    expect(s.achieved).toBe(false);
    s = step(s, StepResult.WIN);
    expect(s.achieved).toBe(true);
    expect(s.completions).toBe(1);
    expect(s.consecutiveWins).toBe(0);
  });

  it('a loss after two wins fails (resets) the sequence', () => {
    let s = initialSequence();
    s = step(s, StepResult.WIN);
    s = step(s, StepResult.WIN);
    s = step(s, StepResult.LOSS);
    expect(s.consecutiveWins).toBe(0);
    expect(s.achieved).toBe(false);
  });

  it('SKIP and PUSH neither advance nor break', () => {
    let s = initialSequence();
    s = step(s, StepResult.WIN);
    s = step(s, StepResult.SKIPPED, PredictionCategory.BELOW_THRESHOLD);
    s = step(s, StepResult.PUSH);
    expect(s.consecutiveWins).toBe(1);
  });

  it('profiles filter which recommendations count (HIGH_ONLY ignores QUALIFIED wins)', () => {
    let s = initialSequence();
    s = advanceSequence(s, StepResult.WIN, PredictionCategory.QUALIFIED, SessionProfile.HIGH_ONLY);
    expect(s.consecutiveWins).toBe(0); // QUALIFIED not counted under HIGH_ONLY
    s = advanceSequence(s, StepResult.WIN, PredictionCategory.HIGH_RECOMMENDATION, SessionProfile.HIGH_ONLY);
    expect(s.consecutiveWins).toBe(1);
  });
});

// ===========================================================================
// START FLOW
// ===========================================================================
describe('session — start flow', () => {
  it('requires at least 8 non-Tie results', () => {
    expect(() => startSession(bankerRounds(7), SessionEnvironment.LIVE_FORWARD, { now: NOW })).toThrow(
      InsufficientHistoryError,
    );
  });

  it('Start Live locks a recommendation for the next target round', () => {
    const s = start(SessionEnvironment.LIVE_FORWARD);
    expect(s.workflow).toBe(WorkflowState.WAITING_FOR_RESULT);
    expect(s.environment).toBe(SessionEnvironment.LIVE_FORWARD);
    expect(s.currentPrediction?.targetRound).toBe(13);
    expect(s.currentPrediction?.decision).toBe(PredictionDecision.BET_BANKER);
    expect(s.predictions).toHaveLength(1);
  });

  it('Start Historical Test tags submitted rounds with the historical-test source', () => {
    const s = start(SessionEnvironment.HISTORICAL_TEST);
    const next = submitResult(s, Winner.BANKER, { now: NOW, operatorAction: OperatorAction.PLAYED });
    const submitted = next.rounds[next.rounds.length - 1];
    expect(submitted.source).toBe(RoundSource.HISTORICAL_TEST);
  });
});

// ===========================================================================
// PREDICTION LOCK (immutability)
// ===========================================================================
describe('session — prediction lock immutability', () => {
  it('a locked prediction is deep-frozen and cannot be silently changed', () => {
    const s = start();
    const p = s.currentPrediction!;
    expect(Object.isFrozen(p)).toBe(true);
    expect(() => {
      (p as { confidence: number }).confidence = 0.1;
    }).toThrow();
    expect(() => {
      (p as { decision: PredictionDecision }).decision = PredictionDecision.SKIP;
    }).toThrow();
    expect(Object.isFrozen(p.moduleResults)).toBe(true);
  });
});

// ===========================================================================
// RESULT SUBMISSION (transaction + duplicate rejection + WIN/LOSS/PUSH)
// ===========================================================================
describe('session — result submission', () => {
  it('records a WIN and advances the engine sequence for a correct banker call', () => {
    const s = start();
    const next = submitResult(s, Winner.BANKER, { now: NOW, operatorAction: OperatorAction.PLAYED });
    const resolved = next.predictions[0];
    expect(resolved.result).toBe(StepResult.WIN);
    expect(resolved.actualWinner).toBe(Winner.BANKER);
    expect(next.sequences.engine.EXPERIMENTAL_PLUS.consecutiveWins).toBe(1);
    expect(next.sequences.played.EXPERIMENTAL_PLUS.consecutiveWins).toBe(1);
    expect(next.rounds).toHaveLength(13);
    expect(next.currentPrediction?.targetRound).toBe(14);
  });

  it('records a LOSS for an incorrect call and a PUSH for a Tie', () => {
    const loss = submitResult(start(), Winner.PLAYER, { now: NOW, operatorAction: OperatorAction.PLAYED });
    expect(loss.predictions[0].result).toBe(StepResult.LOSS);
    const push = submitResult(start(), Winner.TIE, { now: NOW, operatorAction: OperatorAction.PLAYED });
    expect(push.predictions[0].result).toBe(StepResult.PUSH);
  });

  it('engine sequence advances but played sequence does not on NOT_PLAYED', () => {
    const next = submitResult(start(), Winner.BANKER, { now: NOW, operatorAction: OperatorAction.NOT_PLAYED });
    expect(next.sequences.engine.EXPERIMENTAL_PLUS.consecutiveWins).toBe(1);
    expect(next.sequences.played.EXPERIMENTAL_PLUS.consecutiveWins).toBe(0);
  });

  it('rejects duplicate/out-of-order results (wrong target round) atomically', () => {
    const s = start();
    const snapshot = JSON.stringify(serializeSession(s));
    expect(() => submitResult(s, Winner.BANKER, { now: NOW, expectedTargetRound: 999 })).toThrow(
      TargetRoundError,
    );
    // original session unchanged (transactional: nothing partially applied)
    expect(JSON.stringify(serializeSession(s))).toBe(snapshot);
  });

  it('rejects result input when not waiting for a result (input disabled)', () => {
    const closed = newShoe(start(), { shoeId: 'shoe-next' }); // HISTORY_INPUT, no prediction
    expect(() => submitResult(closed, Winner.BANKER, { now: NOW })).toThrow(DuplicateResultError);
  });
});

// ===========================================================================
// SEQUENCES END-TO-END (completion, loss-after-two, new shoe)
// ===========================================================================
describe('session — sequences end-to-end', () => {
  const playBanker = (s: ReturnType<typeof start>) =>
    submitResult(s, Winner.BANKER, { now: NOW, operatorAction: OperatorAction.PLAYED });

  it('three played wins complete the sequence within one shoe', () => {
    let s = start();
    s = playBanker(s);
    s = playBanker(s);
    s = playBanker(s);
    expect(s.sequences.engine.EXPERIMENTAL_PLUS.achieved).toBe(true);
    expect(s.sequences.played.EXPERIMENTAL_PLUS.achieved).toBe(true);
    expect(s.paper.wins).toBe(3);
    expect(s.paper.netUnits).toBe(3);
  });

  it('a loss after two wins resets the sequence', () => {
    let s = start();
    s = playBanker(s);
    s = playBanker(s);
    s = submitResult(s, Winner.PLAYER, { now: NOW, operatorAction: OperatorAction.PLAYED });
    expect(s.sequences.engine.EXPERIMENTAL_PLUS.consecutiveWins).toBe(0);
    expect(s.sequences.engine.EXPERIMENTAL_PLUS.achieved).toBe(false);
  });

  it('New Shoe ends an unfinished sequence', () => {
    let s = start();
    s = playBanker(s);
    s = playBanker(s);
    const fresh = newShoe(s, { shoeId: 'shoe-2' });
    expect(fresh.workflow).toBe(WorkflowState.HISTORY_INPUT);
    expect(fresh.sequences.engine.EXPERIMENTAL_PLUS.consecutiveWins).toBe(0);
    expect(fresh.sequences.engine.EXPERIMENTAL_PLUS.achieved).toBe(false);
    expect(fresh.rounds).toHaveLength(0);
  });
});

// ===========================================================================
// EDITING LIVE HISTORY (revision invalidation)
// ===========================================================================
describe('session — history revision invalidation', () => {
  it('invalidates affected predictions, keeps the audit trail, and re-locks a new prediction', () => {
    let s = start();
    s = submitResult(s, Winner.BANKER, { now: NOW, operatorAction: OperatorAction.PLAYED });
    const beforeCount = s.predictions.length;
    const edited = editHistory(
      s,
      13,
      { winner: Winner.PLAYER, playerPair: PairState.NO, bankerPair: PairState.NO },
      { now: '2026-01-02T00:00:00.000Z', historyConfirmed: true },
    );
    // revision recorded, audit trail preserved (old entries not deleted)
    expect(edited.revisions).toHaveLength(1);
    expect(edited.predictions.length).toBeGreaterThan(beforeCount);
    // predictions targeting round >= 13 are invalidated
    const invalidated = edited.predictions.filter((e) => e.invalidated);
    expect(invalidated.length).toBeGreaterThanOrEqual(1);
    expect(invalidated.every((e) => e.result === StepResult.INVALIDATED)).toBe(true);
    // a fresh, valid prediction exists for the next target
    expect(edited.currentPrediction).not.toBeNull();
    expect(edited.currentPrediction?.locked).toBe(true);
    expect(edited.workflow).toBe(WorkflowState.WAITING_FOR_RESULT);
  });
});

// ===========================================================================
// RESTART RECONSTRUCTION
// ===========================================================================
describe('session — application restart reconstruction', () => {
  it('rebuilds sequences + current prediction deterministically from persisted state', () => {
    let s = start();
    s = submitResult(s, Winner.BANKER, { now: NOW, operatorAction: OperatorAction.PLAYED });
    s = submitResult(s, Winner.BANKER, { now: NOW, operatorAction: OperatorAction.PLAYED });

    const persisted = JSON.parse(JSON.stringify(serializeSession(s)));
    const restored = reconstructSession(persisted);

    expect(restored.rounds).toHaveLength(s.rounds.length);
    expect(restored.currentPrediction?.targetRound).toBe(s.currentPrediction?.targetRound);
    expect(restored.currentPrediction?.decision).toBe(s.currentPrediction?.decision);
    expect(restored.sequences).toEqual(s.sequences);
    expect(restored.paper).toEqual(s.paper);
  });

  it('advanceProfileMap advances all three profiles for an in-profile HIGH win', () => {
    const map = advanceProfileMap(
      {
        EXPERIMENTAL_PLUS: initialSequence(),
        QUALIFIED_PLUS: initialSequence(),
        HIGH_ONLY: initialSequence(),
      },
      StepResult.WIN,
      PredictionCategory.HIGH_RECOMMENDATION,
    );
    expect(map.EXPERIMENTAL_PLUS.consecutiveWins).toBe(1);
    expect(map.QUALIFIED_PLUS.consecutiveWins).toBe(1);
    expect(map.HIGH_ONLY.consecutiveWins).toBe(1);
  });
});
