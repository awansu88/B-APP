/**
 * `useHistorySession` — the React seam (Principle #3) between the pure History
 * domain and the Active Shoe screen. It owns the loaded raw rounds, derives the
 * roadmap + statistics purely, and persists every mutation through a
 * `HistoryStore`. A `TransactionGuard` prevents double-taps and concurrent
 * writes. No prediction logic lives here (out of scope for Milestone 2).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { RoundSource, SessionEnvironment } from '@/src/domain/models/enums';
import { Winner } from '@/src/domain/models/outcome';
import { PairState } from '@/src/domain/models/pair';
import type { RevisionRecord, ShoeRecord } from '@/src/domain/models/records';
import type { RoundRecord } from '@/src/domain/models/round';
import { buildRoadmap } from '@/src/domain/roadmap/engine';
import type { RoadmapResult } from '@/src/domain/roadmap/types';
import {
  InputDraft,
  PairInputMode,
  RoundEdit,
  ShoeStatistics,
  TransactionGuard,
  appendRound,
  canStartForwardModes,
  computeStatistics,
  deleteRound as deleteRoundPure,
  editRound as editRoundPure,
  emptyDraft,
  isCheckpointRound,
  nonTieResultsRemaining,
  resetDraft,
  resolvePairState,
  setPairMode as setPairModePure,
  toggleBankerPair,
  togglePlayerPair,
  undoLast,
} from '@/src/domain/history';
import {
  HistoryStore,
  newShoeRecord,
} from './history-store';
import { createHistoryStore } from './create-store';

const sourceForEnvironment = (env: SessionEnvironment): RoundSource => {
  switch (env) {
    case SessionEnvironment.LIVE_FORWARD:
      return RoundSource.LIVE;
    case SessionEnvironment.HISTORICAL_TEST:
      return RoundSource.HISTORICAL_TEST;
    default:
      return RoundSource.HISTORY;
  }
};

let idCounter = 0;
const makeRoundId = (shoeId: string, roundNumber: number): string => {
  idCounter += 1;
  return `${shoeId}-r${roundNumber}-${Date.now()}-${idCounter}`;
};

export interface HistorySessionState {
  readonly ready: boolean;
  readonly initializationError: string | null;
  readonly busy: boolean;
  readonly shoe: ShoeRecord | null;
  readonly rounds: readonly RoundRecord[];
  readonly roadmap: RoadmapResult;
  readonly statistics: ShoeStatistics;
  readonly draft: InputDraft;
  readonly sessionMode: SessionEnvironment;
  readonly canStartForwardModes: boolean;
  readonly nonTieRemaining: number;
  readonly historyConfirmed: boolean;
  readonly checkpointDue: boolean;
}

export interface HistorySessionActions {
  retryInitialization(): void;
  addResult(winner: Winner): void;
  undo(): void;
  editRound(roundNumber: number, edit: RoundEdit): void;
  deleteRound(roundNumber: number): void;
  clearShoe(): void;
  newShoe(): void;
  startLive(): void;
  startHistoricalTest(): void;
  setPairMode(mode: PairInputMode): void;
  togglePlayerPair(): void;
  toggleBankerPair(): void;
  resetPairSelections(): void;
  confirmHistory(): void;
  dismissCheckpoint(): void;
}

const EMPTY_ROADMAP: RoadmapResult = buildRoadmap([]);

type HistoryInitializationResult =
  | { readonly ok: true; readonly store: HistoryStore; readonly snapshot: Awaited<ReturnType<HistoryStore['loadActive']>> }
  | { readonly ok: false; readonly error: string };

/** Catch the complete native History startup path so it cannot reject unhandled. */
export async function initializeHistorySession(
  createStore: () => Promise<HistoryStore>,
): Promise<HistoryInitializationResult> {
  try {
    const store = await createStore();
    const snapshot = await store.loadActive();
    return { ok: true, store, snapshot };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function useHistorySession(): HistorySessionState & HistorySessionActions {
  const storeRef = useRef<HistoryStore | null>(null);
  const guardRef = useRef(new TransactionGuard());

  const [ready, setReady] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [initializationAttempt, setInitializationAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [shoe, setShoe] = useState<ShoeRecord | null>(null);
  const [rounds, setRounds] = useState<readonly RoundRecord[]>([]);
  const [draft, setDraft] = useState<InputDraft>(emptyDraft(PairInputMode.PARTIAL));
  const [historyConfirmed, setHistoryConfirmed] = useState(false);
  const [dismissedCheckpoint, setDismissedCheckpoint] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    setReady(false);
    setInitializationError(null);
    storeRef.current = null;
    (async () => {
      const result = await initializeHistorySession(createHistoryStore);
      if (!mounted) return;
      if (!result.ok) {
        setInitializationError(result.error);
        return;
      }
      storeRef.current = result.store;
      setShoe(result.snapshot.shoe);
      setRounds(result.snapshot.rounds);
      setReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, [initializationAttempt]);

  const retryInitialization = useCallback(
    () => setInitializationAttempt((attempt) => attempt + 1),
    [],
  );

  const roadmap = useMemo(
    () => (rounds.length ? buildRoadmap(rounds.slice()) : EMPTY_ROADMAP),
    [rounds],
  );
  const statistics = useMemo(() => computeStatistics(rounds), [rounds]);
  const sessionMode = shoe?.environment ?? SessionEnvironment.HISTORY_INPUT;
  const canStart = canStartForwardModes(rounds);
  const nonTieRemaining = nonTieResultsRemaining(rounds);
  const checkpointDue =
    isCheckpointRound(rounds.length) && dismissedCheckpoint !== rounds.length;

  /** Persist a mutation exclusively (guards against double-taps). */
  const commit = useCallback(
    async (
      nextShoe: ShoeRecord,
      nextRounds: readonly RoundRecord[],
      revision: RevisionRecord | null,
    ) => {
      const store = storeRef.current;
      if (!store) return;
      try {
        await guardRef.current.run(async () => {
          setBusy(true);
          await store.commit(nextShoe, nextRounds, revision);
          setShoe(nextShoe);
          setRounds(nextRounds);
        });
      } catch {
        // BusyError (ignored double-tap) or a transient persistence error.
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const withUpdatedShoe = useCallback(
    (base: ShoeRecord, count: number, now: string): ShoeRecord => ({
      ...base,
      roundCount: count,
      updatedAt: now,
    }),
    [],
  );

  const addResult = useCallback(
    (winner: Winner) => {
      if (!shoe || busy || guardRef.current.isBusy) return;
      const now = new Date().toISOString();
      const playerPair = resolvePairState(
        draft.playerPairSelected,
        draft.pairMode,
      );
      const bankerPair = resolvePairState(
        draft.bankerPairSelected,
        draft.pairMode,
      );
      const { rounds: next, revision } = appendRound(
        rounds,
        shoe.id,
        winner,
        playerPair,
        bankerPair,
        sourceForEnvironment(shoe.environment),
        { now, newRoundId: makeRoundId(shoe.id, rounds.length + 1) },
      );
      setDraft((d) => resetDraft(d));
      void commit(withUpdatedShoe(shoe, next.length, now), next, revision);
    },
    [shoe, busy, draft, rounds, commit, withUpdatedShoe],
  );

  const undo = useCallback(() => {
    if (!shoe || busy || guardRef.current.isBusy) return;
    const now = new Date().toISOString();
    const result = undoLast(rounds, { now, newRoundId: '' });
    if (!result) return;
    void commit(
      withUpdatedShoe(shoe, result.rounds.length, now),
      result.rounds,
      result.revision,
    );
  }, [shoe, busy, rounds, commit, withUpdatedShoe]);

  const editRound = useCallback(
    (roundNumber: number, edit: RoundEdit) => {
      if (!shoe || busy || guardRef.current.isBusy) return;
      const now = new Date().toISOString();
      const result = editRoundPure(rounds, roundNumber, edit, {
        now,
        newRoundId: '',
      });
      if (!result) return;
      void commit(withUpdatedShoe(shoe, result.rounds.length, now), result.rounds, result.revision);
    },
    [shoe, busy, rounds, commit, withUpdatedShoe],
  );

  const deleteRound = useCallback(
    (roundNumber: number) => {
      if (!shoe || busy || guardRef.current.isBusy) return;
      const now = new Date().toISOString();
      const result = deleteRoundPure(rounds, roundNumber, {
        now,
        newRoundId: '',
      });
      if (!result) return;
      void commit(withUpdatedShoe(shoe, result.rounds.length, now), result.rounds, result.revision);
    },
    [shoe, busy, rounds, commit, withUpdatedShoe],
  );

  const clearShoe = useCallback(() => {
    if (!shoe || busy || guardRef.current.isBusy) return;
    const now = new Date().toISOString();
    setHistoryConfirmed(false);
    setDismissedCheckpoint(0);
    void commit(withUpdatedShoe(shoe, 0, now), [], null);
  }, [shoe, busy, commit, withUpdatedShoe]);

  const newShoe = useCallback(() => {
    if (!shoe || busy || guardRef.current.isBusy) return;
    const store = storeRef.current;
    if (!store) return;
    const next = newShoeRecord();
    setHistoryConfirmed(false);
    setDismissedCheckpoint(0);
    setDraft(emptyDraft(PairInputMode.PARTIAL));
    (async () => {
      try {
        await guardRef.current.run(async () => {
          setBusy(true);
          const snapshot = await store.startNewShoe(shoe, next);
          setShoe(snapshot.shoe);
          setRounds(snapshot.rounds);
        });
      } catch {
        /* ignored */
      } finally {
        setBusy(false);
      }
    })();
  }, [shoe, busy]);

  const startMode = useCallback(
    (environment: SessionEnvironment) => {
      if (!shoe || busy || guardRef.current.isBusy) return;
      if (!canStartForwardModes(rounds)) return;
      const now = new Date().toISOString();
      void commit({ ...shoe, environment, updatedAt: now }, rounds, null);
    },
    [shoe, busy, rounds, commit],
  );

  const startLive = useCallback(
    () => startMode(SessionEnvironment.LIVE_FORWARD),
    [startMode],
  );
  const startHistoricalTest = useCallback(
    () => startMode(SessionEnvironment.HISTORICAL_TEST),
    [startMode],
  );

  const setPairMode = useCallback((mode: PairInputMode) => {
    setDraft((d) => setPairModePure(d, mode));
  }, []);
  const togglePP = useCallback(() => setDraft((d) => togglePlayerPair(d)), []);
  const toggleBP = useCallback(() => setDraft((d) => toggleBankerPair(d)), []);
  const resetPairSelections = useCallback(() => setDraft((d) => resetDraft(d)), []);
  const confirmHistory = useCallback(() => setHistoryConfirmed(true), []);
  const dismissCheckpoint = useCallback(
    () => setDismissedCheckpoint(rounds.length),
    [rounds.length],
  );

  return {
    ready,
    initializationError,
    busy,
    shoe,
    rounds,
    roadmap,
    statistics,
    draft,
    sessionMode,
    canStartForwardModes: canStart,
    nonTieRemaining,
    historyConfirmed,
    checkpointDue,
    retryInitialization,
    addResult,
    undo,
    editRound,
    deleteRound,
    clearShoe,
    newShoe,
    startLive,
    startHistoricalTest,
    setPairMode,
    togglePlayerPair: togglePP,
    toggleBankerPair: toggleBP,
    resetPairSelections,
    confirmHistory,
    dismissCheckpoint,
  };
}

export { PairState, Winner };
