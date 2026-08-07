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
import { PredictionCategory, PredictionDecision } from '@/src/domain/models/enums';
import { Winner } from '@/src/domain/models/outcome';
import { PairState } from '@/src/domain/models/pair';
import { RoundSource } from '@/src/domain/models/enums';
import type { RoundRecord } from '@/src/domain/models/round';
import {
  OperatorAction,
  SessionEnvironment,
  SessionProfile,
  StepResult,
} from '@/src/domain/session';
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
