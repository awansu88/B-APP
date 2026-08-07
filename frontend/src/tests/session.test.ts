/**
 * Milestone 5 — Live Workflow & Session Tracker tests (deterministic).
 *
 * Pure primitives (evaluation, three-win, profiles) are tested with synthetic
 * locked predictions; the workflow + persistence are tested with real all-Banker
 * sessions (the engine reliably recommends BET_BANKER for a banker-dominated shoe).
 */
import { PredictionCategory, PredictionDecision, ModuleStatus, RoundSource } from '@/src/domain/models/enums';
import { Winner } from '@/src/domain/models/outcome';
import { PairState } from '@/src/domain/models/pair';
import type { RoundRecord } from '@/src/domain/models/round';
import { VoteSide, RiskLevel, DecisionRiskFlag, decide } from '@/src/domain/decision';
import type { DecisionContext } from '@/src/domain/decision';
import { AnalysisSignal, type ModuleAnalysis } from '@/src/domain/analysis';
import { computePrediction } from '@/src/domain/session';
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
    riskScore: 0,
    riskLevel: RiskLevel.NONE,
    reasonCodes: [],
    shadow: {
      decision,
      side,
      confidence: 0.65,
      category,
      riskScore: 0,
      riskLevel: RiskLevel.NONE,
      riskFlags: [],
      reasonCodes: [],
      differsFromActive: false,
    },
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

// ===========================================================================
// M5B — EVALUATION: BOTH DIRECTIONAL PATHS (synthetic locks, engine-independent)
// ===========================================================================
describe('session M5B — evaluation both directional paths', () => {
  const betP = fakePrediction(PredictionDecision.BET_PLAYER, PredictionCategory.QUALIFIED);
  const betB = fakePrediction(PredictionDecision.BET_BANKER, PredictionCategory.QUALIFIED);
  const Q = PredictionCategory.QUALIFIED;
  const adv = (s: ReturnType<typeof initialSequence>, r: StepResult) =>
    advanceSequence(s, r, Q, SessionProfile.EXPERIMENTAL_PLUS);

  it('BET_PLAYER + PLAYER -> WIN', () => {
    expect(evaluatePrediction(betP, Winner.PLAYER)).toBe(StepResult.WIN);
  });
  it('BET_PLAYER + BANKER -> LOSS', () => {
    expect(evaluatePrediction(betP, Winner.BANKER)).toBe(StepResult.LOSS);
  });
  it('BET_BANKER + BANKER -> WIN', () => {
    expect(evaluatePrediction(betB, Winner.BANKER)).toBe(StepResult.WIN);
  });
  it('BET_BANKER + PLAYER -> LOSS', () => {
    expect(evaluatePrediction(betB, Winner.PLAYER)).toBe(StepResult.LOSS);
  });
  it('Tie -> PUSH and leaves the sequence unchanged', () => {
    expect(evaluatePrediction(betP, Winner.TIE)).toBe(StepResult.PUSH);
    let s = adv(initialSequence(), StepResult.WIN);
    const before = s.consecutiveWins;
    s = adv(s, StepResult.PUSH);
    expect(s.consecutiveWins).toBe(before);
    expect(s.achieved).toBe(false);
  });
  it('SKIP -> SKIPPED and leaves the sequence unchanged', () => {
    const skip = fakePrediction(PredictionDecision.SKIP, PredictionCategory.BELOW_THRESHOLD);
    expect(evaluatePrediction(skip, Winner.PLAYER)).toBe(StepResult.SKIPPED);
    let s = adv(initialSequence(), StepResult.WIN);
    const before = s.consecutiveWins;
    s = adv(s, StepResult.SKIPPED);
    expect(s.consecutiveWins).toBe(before);
  });
});

// ===========================================================================
// M5B — EXACT THREE-WIN SEQUENCE LITERALS
// ===========================================================================
describe('session M5B — exact sequence literals', () => {
  const Q = PredictionCategory.QUALIFIED;
  const adv = (s: ReturnType<typeof initialSequence>, r: StepResult) =>
    advanceSequence(s, r, Q, SessionProfile.EXPERIMENTAL_PLUS);

  it('WIN, PUSH, WIN, SKIP, WIN completes the three-win sequence', () => {
    let s = initialSequence();
    s = adv(s, StepResult.WIN); // 1
    s = adv(s, StepResult.PUSH); // neutral
    s = adv(s, StepResult.WIN); // 2
    s = adv(s, StepResult.SKIPPED); // neutral
    expect(s.consecutiveWins).toBe(2);
    expect(s.achieved).toBe(false);
    s = adv(s, StepResult.WIN); // 3 -> complete
    expect(s.achieved).toBe(true);
    expect(s.completions).toBe(1);
    expect(s.consecutiveWins).toBe(0);
  });

  it('WIN, PUSH, LOSS resets the active chain', () => {
    let s = initialSequence();
    s = adv(s, StepResult.WIN);
    s = adv(s, StepResult.PUSH);
    s = adv(s, StepResult.LOSS);
    expect(s.consecutiveWins).toBe(0);
    expect(s.achieved).toBe(false);
  });
});

// ===========================================================================
// M5B — ENGINE vs PLAYED INDEPENDENCE + SHOE BOUNDARY (session-level)
// ===========================================================================
describe('session M5B — engine vs played independence + shoe boundary', () => {
  const playB = (s: ReturnType<typeof start>) =>
    submitResult(s, Winner.BANKER, { now: NOW, operatorAction: OperatorAction.PLAYED });
  const watchB = (s: ReturnType<typeof start>) =>
    submitResult(s, Winner.BANKER, { now: NOW, operatorAction: OperatorAction.NOT_PLAYED });

  it('NOT_PLAYED advances engine only; PLAYED advances both; counters stay independent', () => {
    let s = start();
    s = watchB(s);
    expect(s.sequences.engine.EXPERIMENTAL_PLUS.consecutiveWins).toBe(1);
    expect(s.sequences.played.EXPERIMENTAL_PLUS.consecutiveWins).toBe(0);
    s = playB(s);
    expect(s.sequences.engine.EXPERIMENTAL_PLUS.consecutiveWins).toBe(2);
    expect(s.sequences.played.EXPERIMENTAL_PLUS.consecutiveWins).toBe(1);
  });

  it('a sequence never crosses a shoe boundary (New Shoe resets both counters)', () => {
    let s = start();
    s = playB(s);
    s = playB(s);
    expect(s.sequences.engine.EXPERIMENTAL_PLUS.consecutiveWins).toBe(2);
    const fresh = newShoe(s, { shoeId: 'shoe-boundary' });
    expect(fresh.sequences.engine.EXPERIMENTAL_PLUS.consecutiveWins).toBe(0);
    expect(fresh.sequences.played.EXPERIMENTAL_PLUS.consecutiveWins).toBe(0);
    expect(fresh.rounds).toHaveLength(0);
  });
});

// ===========================================================================
// M5B — FUTURE-LEAKAGE / LOCK-BEFORE-RESULT
// ===========================================================================
describe('session M5B — future-leakage protection (lock before result)', () => {
  it('the locked prediction for target N is identical regardless of the actual result of N', () => {
    const s = start(); // 12 banker rounds -> locks target 13 BEFORE its result
    const lockedBefore = s.currentPrediction!;
    const afterBanker = submitResult(s, Winner.BANKER, { now: NOW, operatorAction: OperatorAction.PLAYED });
    const afterPlayer = submitResult(s, Winner.PLAYER, { now: NOW, operatorAction: OperatorAction.PLAYED });
    const lockedB = afterBanker.predictions.find((e) => e.prediction.targetRound === 13)!.prediction;
    const lockedP = afterPlayer.predictions.find((e) => e.prediction.targetRound === 13)!.prediction;
    // the future actual (BANKER vs PLAYER) never rewrote the pre-locked prediction for 13
    expect(lockedB.decision).toBe(lockedBefore.decision);
    expect(lockedP.decision).toBe(lockedBefore.decision);
    expect(lockedB.confidence).toBe(lockedBefore.confidence);
    expect(lockedP.confidence).toBe(lockedBefore.confidence);
    expect(lockedB.category).toBe(lockedBefore.category);
    expect(lockedP.category).toBe(lockedBefore.category);
    expect(lockedB.snapshotVersion).toBe(lockedBefore.snapshotVersion);
  });

  it('target N snapshot/decision uses only rounds < N (round N is never in its own snapshot)', () => {
    const rounds = bankerRounds(14);
    const opts = { now: NOW, historyConfirmed: true } as const;
    const p12a = computePrediction(rounds.slice(0, 12), SessionEnvironment.LIVE_FORWARD, 'shoe-fl', opts);
    const p12b = computePrediction(rounds.slice(0, 12), SessionEnvironment.LIVE_FORWARD, 'shoe-fl', opts);
    expect(p12a.targetRound).toBe(13);
    expect(p12a).toEqual(p12b); // deterministic, depends only on rounds < 13
    // including round 13 shifts the target to 14 — proving round N never feeds target N
    const p13 = computePrediction(rounds.slice(0, 13), SessionEnvironment.LIVE_FORWARD, 'shoe-fl', opts);
    expect(p13.targetRound).toBe(14);
  });
});

// ===========================================================================
// M5B — RECONSTRUCTED LOCKS REMAIN DEEPLY FROZEN
// ===========================================================================
describe('session M5B — reconstructed locks remain deeply frozen', () => {
  it('serialize -> JSON -> reconstruct yields deep-frozen locked predictions', () => {
    let s = start();
    s = submitResult(s, Winner.BANKER, { now: NOW, operatorAction: OperatorAction.PLAYED });
    const persisted = JSON.parse(JSON.stringify(serializeSession(s)));
    const restored = reconstructSession(persisted);
    const p = restored.currentPrediction!;
    expect(Object.isFrozen(p)).toBe(true);
    expect(() => {
      (p as { confidence: number }).confidence = 0.01;
    }).toThrow();
    expect(Object.isFrozen(p.moduleResults)).toBe(true);
    expect(Object.isFrozen(p.riskFlags)).toBe(true);
    expect(Object.isFrozen(p.reasonCodes)).toBe(true);
    expect(Object.isFrozen(p.shadow)).toBe(true);
    expect(() => {
      (p.shadow as { confidence: number }).confidence = 0.01;
    }).toThrow();
    if (p.moduleResults.length > 0) expect(Object.isFrozen(p.moduleResults[0])).toBe(true);
    // a resolved historical lock is frozen too
    const resolved = restored.predictions.find((e) => e.result === StepResult.WIN)!.prediction;
    expect(Object.isFrozen(resolved)).toBe(true);
  });
});

// ===========================================================================
// M5B — RESTART RECONSTRUCTION (persist -> JSON -> reconstruct)
// ===========================================================================
describe('session M5B — restart reconstruction scenarios', () => {
  const roundTrip = (s: ReturnType<typeof start>) =>
    reconstructSession(JSON.parse(JSON.stringify(serializeSession(s))));

  it('A. lock N -> persist -> reconstruct -> identical locked prediction', () => {
    const s = start();
    const before = s.currentPrediction!;
    const restored = roundTrip(s);
    expect(restored.currentPrediction).toEqual(before);
  });

  it('B. lock -> WIN -> persist -> reconstruct -> same evaluation + sequences + paper', () => {
    let s = start();
    s = submitResult(s, Winner.BANKER, { now: NOW, operatorAction: OperatorAction.PLAYED });
    const restored = roundTrip(s);
    expect(restored.predictions.find((e) => e.prediction.targetRound === 13)!.result).toBe(
      StepResult.WIN,
    );
    expect(restored.sequences).toEqual(s.sequences);
    expect(restored.paper).toEqual(s.paper);
  });

  it('C. WIN, PUSH, WIN, WIN survives reconstruction between steps and still completes', () => {
    let s = start();
    s = roundTrip(submitResult(s, Winner.BANKER, { now: NOW, operatorAction: OperatorAction.PLAYED })); // eng 1
    s = roundTrip(submitResult(s, Winner.TIE, { now: NOW, operatorAction: OperatorAction.PLAYED })); // neutral PUSH
    s = roundTrip(submitResult(s, Winner.BANKER, { now: NOW, operatorAction: OperatorAction.PLAYED })); // eng 2
    expect(s.sequences.engine.EXPERIMENTAL_PLUS.achieved).toBe(false);
    s = roundTrip(submitResult(s, Winner.BANKER, { now: NOW, operatorAction: OperatorAction.PLAYED })); // eng 3 -> complete
    expect(s.sequences.engine.EXPERIMENTAL_PLUS.achieved).toBe(true);
    expect(s.sequences.engine.EXPERIMENTAL_PLUS.completions).toBe(1);
  });

  it('D. PLAYED / NOT_PLAYED distinction survives reconstruction', () => {
    let s = start();
    s = submitResult(s, Winner.BANKER, { now: NOW, operatorAction: OperatorAction.NOT_PLAYED });
    s = submitResult(s, Winner.BANKER, { now: NOW, operatorAction: OperatorAction.PLAYED });
    const restored = roundTrip(s);
    expect(restored.sequences.engine.EXPERIMENTAL_PLUS.consecutiveWins).toBe(2);
    expect(restored.sequences.played.EXPERIMENTAL_PLUS.consecutiveWins).toBe(1);
    expect(restored.paper.wins).toBe(1); // only the PLAYED win is staked
    const actions = restored.predictions
      .filter((e) => e.result === StepResult.WIN)
      .map((e) => e.operatorAction)
      .sort();
    expect(actions).toEqual([OperatorAction.NOT_PLAYED, OperatorAction.PLAYED]);
  });

  it('E. revision invalidation survives reconstruction', () => {
    let s = start();
    s = submitResult(s, Winner.BANKER, { now: NOW, operatorAction: OperatorAction.PLAYED });
    s = editHistory(
      s,
      13,
      { winner: Winner.PLAYER, playerPair: PairState.NO, bankerPair: PairState.NO },
      { now: '2026-01-02T00:00:00.000Z', historyConfirmed: true },
    );
    const restored = roundTrip(s);
    const invalidated = restored.predictions.filter((e) => e.invalidated);
    expect(invalidated.length).toBeGreaterThanOrEqual(1);
    expect(invalidated.every((e) => e.result === StepResult.INVALIDATED)).toBe(true);
    expect(restored.revisions.length).toBe(s.revisions.length);
    // sequences reconstructed ONLY from surviving (non-invalidated) evaluations
    expect(restored.sequences).toEqual(s.sequences);
  });

  it('G. reconstruction never creates a duplicate lock for a target round', () => {
    let s = start();
    s = submitResult(s, Winner.BANKER, { now: NOW, operatorAction: OperatorAction.PLAYED });
    s = submitResult(s, Winner.BANKER, { now: NOW, operatorAction: OperatorAction.PLAYED });
    const restored = roundTrip(s);
    const targets = restored.predictions.map((e) => e.prediction.targetRound);
    expect(new Set(targets).size).toBe(targets.length); // all target rounds unique
    const pendingEntries = restored.predictions.filter(
      (e) => e.result === StepResult.PENDING && !e.invalidated,
    );
    expect(pendingEntries).toHaveLength(1);
    expect(restored.currentPrediction?.targetRound).toBe(pendingEntries[0].prediction.targetRound);
  });
});

// ===========================================================================
// M5B — SHADOW AUDIT NEVER INFLUENCES THE ACTIVE LOCK
// ===========================================================================
describe('session M5B — shadow audit never influences the active lock', () => {
  const mr = (
    moduleId: string,
    signal: AnalysisSignal,
    strength: number,
    reliability: number,
  ): ModuleAnalysis => ({
    moduleId,
    signal,
    strength,
    reliability,
    status: ModuleStatus.ACTIVE,
    reasonCodes: [],
    riskFlags: [],
    version: 'TEST',
  });
  const baseCtx = (recentPatternBreaks: number): DecisionContext => ({
    nonTieCount: 15,
    regimeTransitioning: false,
    recentPatternBreaks,
    dataQuality: {
      warmupMet: true,
      winnerCompleteness: 1,
      pairCompleteness: 1,
      revisions: 0,
      missingRounds: 0,
    },
  });

  it('changing only the SHADOW (volatility) input leaves ACTIVE identical while SHADOW differs', () => {
    const modules = [
      mr('streak', AnalysisSignal.PLAYER, 1, 0.5),
      mr('chop', AnalysisSignal.PLAYER, 1, 0.5),
    ];
    const low = decide(modules, baseCtx(0));
    const high = decide(modules, baseCtx(3));
    // ACTIVE is unaffected by the SHADOW-only volatility signal
    expect(high.active.decision).toBe(low.active.decision);
    expect(high.active.side).toBe(low.active.side);
    expect(high.active.confidence).toBe(low.active.confidence);
    expect(high.active.category).toBe(low.active.category);
    expect(high.active.riskLevel).toBe(low.active.riskLevel);
    expect(high.active.riskFlags).toEqual(low.active.riskFlags);
    expect(high.active.riskFlags).not.toContain(DecisionRiskFlag.RECENT_PATTERN_BREAK);
    // SHADOW records the volatility difference (auditable, never influential)
    expect(high.shadow.riskFlags).toContain(DecisionRiskFlag.RECENT_PATTERN_BREAK);
    expect(low.shadow.riskFlags).not.toContain(DecisionRiskFlag.RECENT_PATTERN_BREAK);
  });
});
