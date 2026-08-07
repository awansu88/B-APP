/**
 * Milestone-5C workflow/store integration matrix (A–O).
 *
 * Exercises the SessionStore contract (via the platform-neutral
 * MemorySessionStore, which shares the exact domain reducers used by the native
 * SqliteSessionStore) for the live workflow: lock-before-result, evaluation of
 * both directional paths, Tie/SKIP neutrality, engine-vs-played independence,
 * reload persistence, loss reset, revision invalidation, and shoe boundaries.
 * SKIP uses a deterministic synthetic fixture (the current engine bets on a
 * one-sided shoe), per the milestone's guidance.
 */
import { PredictionCategory, PredictionDecision, RoundSource } from '@/src/domain/models/enums';
import { Winner } from '@/src/domain/models/outcome';
import { PairState } from '@/src/domain/models/pair';
import type { RoundRecord } from '@/src/domain/models/round';
import {
  OperatorAction,
  SessionEnvironment,
  SessionProfile,
  StepResult,
} from '@/src/domain/session';
import { PairInputMode, resolvePairState, resetDraft, emptyDraft, TransactionGuard } from '@/src/domain/history';
import { MemorySessionStore, type KvStore } from '@/src/workflows/session/session-store';

const NOW = '2026-01-01T00:00:00.000Z';
const EXP = SessionProfile.EXPERIMENTAL_PLUS;
const play = { now: NOW, operatorAction: OperatorAction.PLAYED };
const watch = { now: NOW, operatorAction: OperatorAction.NOT_PLAYED };

class MemKv implements KvStore {
  readonly map = new Map<string, string>();
  async getItem(key: string, fallback: string): Promise<string | null> {
    return this.map.has(key) ? (this.map.get(key) as string) : fallback;
  }
  async setItem(key: string, value: string): Promise<boolean> {
    this.map.set(key, value);
    return true;
  }
  keys(): string[] {
    return [...this.map.keys()];
  }
}

class FailingKv implements KvStore {
  async getItem(_key: string, fallback: string): Promise<string | null> {
    return fallback;
  }
  async setItem(): Promise<boolean> {
    throw new Error('storage unavailable');
  }
}

const roundsOf = (n: number, winner: Winner, shoe: string): RoundRecord[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${shoe}-r${i + 1}`,
    shoeId: shoe,
    roundNumber: i + 1,
    winner,
    playerPair: PairState.UNKNOWN,
    bankerPair: PairState.UNKNOWN,
    source: RoundSource.HISTORY,
    createdAt: NOW,
  }));

const banker = (n: number, shoe = 's1') => roundsOf(n, Winner.BANKER, shoe);
const player = (n: number, shoe = 'sp') => roundsOf(n, Winner.PLAYER, shoe);

const freshStore = () => new MemorySessionStore(new MemKv());

describe('M5C workflow matrix', () => {
  it('A. Start Live persists a lock and makes actual-result input eligible', async () => {
    const store = freshStore();
    const started = await store.startLive('s1', banker(12), SessionEnvironment.LIVE_FORWARD, {
      now: NOW,
    });
    expect(started.currentPrediction?.targetRound).toBe(13);
    // eligibility == a valid pending lock exists to evaluate against
    expect(started.currentPrediction).not.toBeNull();
  });

  it('B. lock persistence failure => actual result rejected, nothing persisted', async () => {
    const kv = new FailingKv();
    const store = new MemorySessionStore(kv);
    await expect(
      store.startLive('s1', banker(12), SessionEnvironment.LIVE_FORWARD, { now: NOW }),
    ).rejects.toThrow();
    // No session persisted -> submit is rejected by the lock-before-result guard.
    await expect(new MemorySessionStore(kv).submitResult('s1', Winner.BANKER, play)).rejects.toThrow();
  });

  it('C/D. BET_PLAYER + PLAYER => WIN ; BET_PLAYER + BANKER => LOSS', async () => {
    const winStore = freshStore();
    const w = await winStore.startLive('sp', player(12), SessionEnvironment.LIVE_FORWARD, {
      now: NOW,
    });
    expect(w.currentPrediction?.decision).toBe(PredictionDecision.BET_PLAYER);
    const afterWin = await winStore.submitResult('sp', Winner.PLAYER, play);
    expect(afterWin.predictions.find((e) => e.prediction.targetRound === 13)?.result).toBe(
      StepResult.WIN,
    );

    const lossStore = freshStore();
    await lossStore.startLive('sp', player(12), SessionEnvironment.LIVE_FORWARD, { now: NOW });
    const afterLoss = await lossStore.submitResult('sp', Winner.BANKER, play);
    expect(afterLoss.predictions.find((e) => e.prediction.targetRound === 13)?.result).toBe(
      StepResult.LOSS,
    );
  });

  it('E/F. BET_BANKER + BANKER => WIN ; BET_BANKER + PLAYER => LOSS', async () => {
    const winStore = freshStore();
    const w = await winStore.startLive('s1', banker(12), SessionEnvironment.LIVE_FORWARD, {
      now: NOW,
    });
    expect(w.currentPrediction?.decision).toBe(PredictionDecision.BET_BANKER);
    const afterWin = await winStore.submitResult('s1', Winner.BANKER, play);
    expect(afterWin.predictions.find((e) => e.prediction.targetRound === 13)?.result).toBe(
      StepResult.WIN,
    );

    const lossStore = freshStore();
    await lossStore.startLive('s1', banker(12), SessionEnvironment.LIVE_FORWARD, { now: NOW });
    const afterLoss = await lossStore.submitResult('s1', Winner.PLAYER, play);
    expect(afterLoss.predictions.find((e) => e.prediction.targetRound === 13)?.result).toBe(
      StepResult.LOSS,
    );
  });

  it('G. BET + TIE => PUSH and the sequence is unchanged', async () => {
    const store = freshStore();
    await store.startLive('s1', banker(12), SessionEnvironment.LIVE_FORWARD, { now: NOW });
    const win = await store.submitResult('s1', Winner.BANKER, play); // eng 1
    expect(win.sequences.engine[EXP].consecutiveWins).toBe(1);
    const push = await store.submitResult('s1', Winner.TIE, play);
    expect(push.predictions.find((e) => e.prediction.targetRound === 14)?.result).toBe(
      StepResult.PUSH,
    );
    expect(push.sequences.engine[EXP].consecutiveWins).toBe(1); // unchanged
  });

  it('H. SKIP => actual round accepted, evaluation SKIPPED, sequence unchanged, next target locked', async () => {
    const kv = new MemKv();
    const store = new MemorySessionStore(kv);
    await store.startLive('s1', banker(12), SessionEnvironment.LIVE_FORWARD, { now: NOW });
    // Deterministic SKIP fixture: rewrite the persisted pending lock as a SKIP.
    const key = kv.keys()[0];
    const persisted = JSON.parse((await kv.getItem(key, '')) as string);
    persisted.predictions[0].prediction.decision = PredictionDecision.SKIP;
    persisted.predictions[0].prediction.side = null;
    persisted.predictions[0].prediction.category = PredictionCategory.BELOW_THRESHOLD;
    await kv.setItem(key, JSON.stringify(persisted));

    const next = await new MemorySessionStore(kv).submitResult('s1', Winner.PLAYER, watch);
    expect(next.predictions.find((e) => e.prediction.targetRound === 13)?.result).toBe(
      StepResult.SKIPPED,
    );
    expect(next.sequences.engine[EXP].consecutiveWins).toBe(0); // unchanged
    expect(next.rounds).toHaveLength(13); // actual round still accepted
    expect(next.currentPrediction?.targetRound).toBe(14); // next target locked
  });

  it('I/J. PLAYED WIN advances engine+played ; NOT_PLAYED WIN advances engine only', async () => {
    const store = freshStore();
    await store.startLive('s1', banker(12), SessionEnvironment.LIVE_FORWARD, { now: NOW });
    const a = await store.submitResult('s1', Winner.BANKER, watch); // NOT_PLAYED
    expect(a.sequences.engine[EXP].consecutiveWins).toBe(1);
    expect(a.sequences.played[EXP].consecutiveWins).toBe(0);
    const b = await store.submitResult('s1', Winner.BANKER, play); // PLAYED
    expect(b.sequences.engine[EXP].consecutiveWins).toBe(2);
    expect(b.sequences.played[EXP].consecutiveWins).toBe(1);
  });

  it('K. WIN, PUSH, WIN, WIN with reload between steps => engine sequence COMPLETE', async () => {
    const kv = new MemKv();
    await new MemorySessionStore(kv).startLive('s1', banker(12), SessionEnvironment.LIVE_FORWARD, {
      now: NOW,
    });
    await new MemorySessionStore(kv).submitResult('s1', Winner.BANKER, play); // eng 1
    await new MemorySessionStore(kv).submitResult('s1', Winner.TIE, play); // PUSH
    await new MemorySessionStore(kv).submitResult('s1', Winner.BANKER, play); // eng 2
    const s3 = await new MemorySessionStore(kv).submitResult('s1', Winner.BANKER, play); // eng 3
    expect(s3.sequences.engine[EXP].achieved).toBe(true);
    const restored = await new MemorySessionStore(kv).reconstruct('s1');
    expect(restored?.sequences.engine[EXP].achieved).toBe(true);
  });

  it('L. LOSS resets the current chain', async () => {
    const store = freshStore();
    await store.startLive('s1', banker(12), SessionEnvironment.LIVE_FORWARD, { now: NOW });
    await store.submitResult('s1', Winner.BANKER, play); // eng 1
    const afterWin2 = await store.submitResult('s1', Winner.BANKER, play); // eng 2
    expect(afterWin2.sequences.engine[EXP].consecutiveWins).toBe(2);
    const afterLoss = await store.submitResult('s1', Winner.PLAYER, play);
    expect(afterLoss.sequences.engine[EXP].consecutiveWins).toBe(0);
  });

  it('M. reload with a pending lock => same lock, no duplicate target lock', async () => {
    const kv = new MemKv();
    const started = await new MemorySessionStore(kv).startLive(
      's1',
      banker(12),
      SessionEnvironment.LIVE_FORWARD,
      { now: NOW },
    );
    const restored = await new MemorySessionStore(kv).reconstruct('s1');
    expect(restored?.currentPrediction).toEqual(started.currentPrediction);
    const validTargets = restored!.predictions
      .filter((e) => !e.invalidated)
      .map((e) => e.prediction.targetRound);
    expect(new Set(validTargets).size).toBe(validTargets.length);
  });

  it('N. revision invalidation keeps the historical lock immutable and marks INVALIDATED', async () => {
    const store = freshStore();
    await store.startLive('s1', banker(12), SessionEnvironment.LIVE_FORWARD, { now: NOW });
    const win = await store.submitResult('s1', Winner.BANKER, play);
    const lockedBefore = win.predictions.find((e) => e.prediction.targetRound === 13)!.prediction;
    const edited = await store.editHistory(
      's1',
      13,
      { winner: Winner.PLAYER, playerPair: PairState.NO, bankerPair: PairState.NO },
      { now: '2026-01-02T00:00:00.000Z' },
    );
    const entry13 = edited.predictions.find(
      (e) => e.prediction.targetRound === 13 && e.invalidated,
    );
    expect(entry13?.result).toBe(StepResult.INVALIDATED);
    // The historical LockedPrediction payload is unchanged (never rewritten).
    expect(entry13?.prediction).toEqual(lockedBefore);
  });

  it('O. new shoe: previous shoe/session preserved; sequence does not cross the boundary', async () => {
    const kv = new MemKv();
    await new MemorySessionStore(kv).startLive('s1', banker(12), SessionEnvironment.LIVE_FORWARD, {
      now: NOW,
    });
    await new MemorySessionStore(kv).submitResult('s1', Winner.BANKER, play);
    await new MemorySessionStore(kv).submitResult('s1', Winner.BANKER, play); // s1 engine = 2

    // Start a fresh shoe (independent session).
    const s2 = await new MemorySessionStore(kv).startLive(
      's2',
      banker(12, 's2'),
      SessionEnvironment.LIVE_FORWARD,
      { now: NOW },
    );
    expect(s2.sequences.engine[EXP].consecutiveWins).toBe(0); // does not cross boundary

    const s1 = await new MemorySessionStore(kv).reconstruct('s1');
    expect(s1?.sequences.engine[EXP].consecutiveWins).toBe(2); // previous shoe preserved
  });
});

const LIVE = SessionEnvironment.LIVE_FORWARD;

describe('M5C live revision + pair-mode matrix', () => {
  it('P. edit before a locked target => revision created, affected entries INVALIDATED, payload immutable', async () => {
    const store = freshStore();
    await store.startLive('s1', banker(12), LIVE, { now: NOW });
    await store.submitResult('s1', Winner.BANKER, play); // resolve 13, lock 14
    const win = await store.submitResult('s1', Winner.BANKER, play); // resolve 14, lock 15
    const locked13 = win.predictions.find((e) => e.prediction.targetRound === 13)!.prediction;

    const edited = await store.editHistory(
      's1',
      10,
      { winner: Winner.PLAYER, playerPair: PairState.NO, bankerPair: PairState.NO },
      { now: '2026-01-02T00:00:00.000Z' },
    );
    // Every entry whose target is at/after the edited round is invalidated.
    for (const t of [13, 14]) {
      const inv = edited.predictions.find((e) => e.prediction.targetRound === t && e.invalidated);
      expect(inv?.result).toBe(StepResult.INVALIDATED);
    }
    expect(edited.revisions.length).toBeGreaterThanOrEqual(1);
    // Historical LockedPrediction payload is NEVER rewritten.
    const stillThere = edited.predictions.find(
      (e) => e.prediction.targetRound === 13 && e.invalidated,
    );
    expect(stillThere?.prediction).toEqual(locked13);
    // A fresh valid pending lock exists for the revised history.
    expect(edited.currentPrediction).not.toBeNull();
  });

  it('Q. delete a historical round => renumber/rebuild, affected invalidated, current valid lock recovered', async () => {
    const store = freshStore();
    await store.startLive('s1', banker(12), LIVE, { now: NOW });
    await store.submitResult('s1', Winner.BANKER, play); // rounds 13, lock 14
    const before = await store.submitResult('s1', Winner.BANKER, play); // rounds 14, lock 15
    expect(before.rounds).toHaveLength(14);

    const deleted = await store.deleteHistory('s1', 13, { now: '2026-01-03T00:00:00.000Z' });
    expect(deleted.rounds).toHaveLength(13); // one round removed + renumbered
    // rounds are contiguously renumbered 1..13
    expect(deleted.rounds.map((r) => r.roundNumber)).toEqual(
      Array.from({ length: 13 }, (_, i) => i + 1),
    );
    // exactly one valid (non-invalidated) pending lock, recovered for the revised history
    const valid = deleted.predictions.filter((e) => !e.invalidated);
    const validTargets = valid.map((e) => e.prediction.targetRound);
    expect(new Set(validTargets).size).toBe(validTargets.length);
    expect(deleted.currentPrediction?.targetRound).toBe(14);
    expect(deleted.revisions.length).toBeGreaterThanOrEqual(1);
  });

  it('R. after live revision, engine sequence reconstructs from VALID entries only', async () => {
    const kv = new MemKv();
    const store = new MemorySessionStore(kv);
    await store.startLive('s1', banker(12), LIVE, { now: NOW });
    await store.submitResult('s1', Winner.BANKER, watch); // target13 WIN, NOT_PLAYED
    await store.submitResult('s1', Winner.BANKER, play); // target14 WIN, PLAYED
    // Edit round 14 -> invalidates target>=14; target13 (valid) survives.
    await store.editHistory(
      's1',
      14,
      { winner: Winner.PLAYER, playerPair: PairState.NO, bankerPair: PairState.NO },
      { now: '2026-01-02T00:00:00.000Z' },
    );
    const restored = await new MemorySessionStore(kv).reconstruct('s1');
    // engine counts the surviving valid WIN (target13) only.
    expect(restored?.sequences.engine[EXP].consecutiveWins).toBe(1);
  });

  it('S. after live revision, played sequence reconstructs from VALID PLAYED entries only', async () => {
    const kv = new MemKv();
    const store = new MemorySessionStore(kv);
    await store.startLive('s1', banker(12), LIVE, { now: NOW });
    await store.submitResult('s1', Winner.BANKER, watch); // target13 WIN, NOT_PLAYED
    await store.submitResult('s1', Winner.BANKER, play); // target14 WIN, PLAYED
    await store.editHistory(
      's1',
      14,
      { winner: Winner.PLAYER, playerPair: PairState.NO, bankerPair: PairState.NO },
      { now: '2026-01-02T00:00:00.000Z' },
    );
    const restored = await new MemorySessionStore(kv).reconstruct('s1');
    // The only surviving valid win (target13) was NOT_PLAYED => played chain is 0.
    expect(restored?.sequences.played[EXP].consecutiveWins).toBe(0);
    expect(restored?.paper.wins).toBe(0);
  });

  it('T. revision state survives persistence + reconstruction', async () => {
    const kv = new MemKv();
    await new MemorySessionStore(kv).startLive('s1', banker(12), LIVE, { now: NOW });
    await new MemorySessionStore(kv).submitResult('s1', Winner.BANKER, play);
    await new MemorySessionStore(kv).editHistory(
      's1',
      13,
      { winner: Winner.PLAYER, playerPair: PairState.NO, bankerPair: PairState.NO },
      { now: '2026-01-02T00:00:00.000Z' },
    );
    const restored = await new MemorySessionStore(kv).reconstruct('s1');
    const invalidated = restored!.predictions.filter((e) => e.invalidated);
    expect(invalidated.length).toBeGreaterThanOrEqual(1);
    expect(invalidated.every((e) => e.result === StepResult.INVALIDATED)).toBe(true);
    expect(restored?.revisions.length).toBeGreaterThanOrEqual(1);
  });

  it('U. live edit does not produce duplicate valid locks', async () => {
    const store = freshStore();
    await store.startLive('s1', banker(12), LIVE, { now: NOW });
    await store.submitResult('s1', Winner.BANKER, play);
    const edited = await store.editHistory(
      's1',
      13,
      { winner: Winner.PLAYER, playerPair: PairState.NO, bankerPair: PairState.NO },
      { now: '2026-01-02T00:00:00.000Z' },
    );
    const validTargets = edited.predictions
      .filter((e) => !e.invalidated)
      .map((e) => e.prediction.targetRound);
    expect(new Set(validTargets).size).toBe(validTargets.length);
  });

  it('G. TransactionGuard rejects a rapid duplicate edit/delete while a write is in flight', async () => {
    const guard = new TransactionGuard();
    let secondRan = false;
    const inFlight = guard.run(() => new Promise<void>((resolve) => setTimeout(resolve, 15)));
    // A concurrent second attempt is rejected (no duplicate revision/prediction write).
    await expect(
      guard.run(async () => {
        secondRan = true;
      }),
    ).rejects.toThrow();
    await inFlight;
    expect(secondRan).toBe(false);
    // Once idle, the guard runs again normally.
    let ran = false;
    await guard.run(async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  it('H. PARTIAL pair mode stores UNKNOWN when a pair is unselected on a live round', async () => {
    const store = freshStore();
    await store.startLive('s1', banker(12), LIVE, { now: NOW });
    const pp = resolvePairState(false, PairInputMode.PARTIAL);
    const bp = resolvePairState(false, PairInputMode.PARTIAL);
    const next = await store.submitResult('s1', Winner.BANKER, {
      ...play,
      playerPair: pp,
      bankerPair: bp,
    });
    const r13 = next.rounds.find((r) => r.roundNumber === 13);
    expect(r13?.playerPair).toBe(PairState.UNKNOWN);
    expect(r13?.bankerPair).toBe(PairState.UNKNOWN);
  });

  it('I. COMPLETE pair mode stores NO when unselected and YES when selected on a live round', async () => {
    const store = freshStore();
    await store.startLive('s1', banker(12), LIVE, { now: NOW });
    const pp = resolvePairState(true, PairInputMode.COMPLETE); // selected -> YES
    const bp = resolvePairState(false, PairInputMode.COMPLETE); // unselected -> NO
    const next = await store.submitResult('s1', Winner.BANKER, {
      ...play,
      playerPair: pp,
      bankerPair: bp,
    });
    const r13 = next.rounds.find((r) => r.roundNumber === 13);
    expect(r13?.playerPair).toBe(PairState.YES);
    expect(r13?.bankerPair).toBe(PairState.NO);
  });

  it('J. PP/BP selection auto-resets after a round while the pair mode is preserved', () => {
    const draft = { ...emptyDraft(PairInputMode.COMPLETE), playerPairSelected: true, bankerPairSelected: true };
    const cleared = resetDraft(draft);
    expect(cleared.playerPairSelected).toBe(false);
    expect(cleared.bankerPairSelected).toBe(false);
    expect(cleared.pairMode).toBe(PairInputMode.COMPLETE); // mode is sticky across rounds
  });
});
