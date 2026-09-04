/**
 * `useLiveSession` — the React seam between the accepted session domain +
 * DB-002 persistence and the Active Shoe Live panel. It owns NO business logic:
 * it reconstructs/starts a persisted session, exposes the persisted LockedPrediction
 * + derived sequence/paper state, and routes operator submissions through the
 * SessionStore (which enforces lock-before-result + transactional persistence).
 *
 * The store is the single writer for live/historical-test rounds, so the panel
 * renders the roadmap from `state.rounds` (authoritative on both native SQLite
 * and the web AsyncStorage fallback).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { SessionEnvironment } from '@/src/domain/models/enums';
import { Winner } from '@/src/domain/models/outcome';
import { PairState } from '@/src/domain/models/pair';
import type { ShoeRecord } from '@/src/domain/models/records';
import type { RoundRecord } from '@/src/domain/models/round';
import { TransactionGuard } from '@/src/domain/history';
import type { RoundEdit } from '@/src/domain/history';
import {
  OperatorAction,
  StepResult,
  type PredictionEntry,
  type SessionState,
} from '@/src/domain/session';
import { createSessionStore } from './create-session-store';
import type { SessionStore, SessionStoreKind } from './session-store';
import { getEngineMode, getNextBalancedThreshold } from '@/src/workflows/preferences';
import type { MatcherCorpus } from '@/src/domain/matcher';
import {
  balancedDecisionConfig,
  resolveShoeThresholdFromLocks,
  type BalancedDecisionConfig,
} from '@/src/domain/decision';
import { useMatcherCorpus } from '@/src/workflows/matcher';

const isForward = (env: SessionEnvironment | undefined): boolean =>
  env === SessionEnvironment.LIVE_FORWARD || env === SessionEnvironment.HISTORICAL_TEST;

export interface LiveSubmitPairs {
  readonly playerPair?: PairState;
  readonly bankerPair?: PairState;
}

export interface LiveSessionView {
  readonly active: boolean;
  readonly ready: boolean;
  readonly busy: boolean;
  readonly state: SessionState | null;
  readonly lastResolved: PredictionEntry | null;
  readonly error: string | null;
  readonly storeKind: SessionStoreKind | null;
}

export interface LiveSessionActions {
  submit(winner: Winner, action: OperatorAction, pairs?: LiveSubmitPairs): void;
  editHistory(roundNumber: number, edit: RoundEdit): void;
  deleteHistoryRound(roundNumber: number): void;
  retry(): void;
}

/** The most recently resolved (non-invalidated) prediction, for result feedback. */
function latestResolved(state: SessionState | null): PredictionEntry | null {
  if (!state) return null;
  for (let i = state.predictions.length - 1; i >= 0; i -= 1) {
    const e = state.predictions[i];
    if (!e.invalidated && e.result !== StepResult.PENDING) return e;
  }
  return null;
}

export function useLiveSession(
  shoe: ShoeRecord | null,
  historyRounds: readonly RoundRecord[],
): LiveSessionView & LiveSessionActions {
  const storeRef = useRef<SessionStore | null>(null);
  const guardRef = useRef(new TransactionGuard());
  const roundsRef = useRef<readonly RoundRecord[]>(historyRounds);
  roundsRef.current = historyRounds;

  // M7.1 Patch 3 Stage B1 — the pre-result matcher corpus (immutable
  // BAPP-CORPUS-001 plus authoritative user DB-002 history) is supplied to EVERY
  // computePrediction call through the store opts. A ref keeps async callbacks
  // on the freshest user dataset without widening their dependency lists.
  const { corpus: matcherCorpus } = useMatcherCorpus(shoe?.id ?? null);
  const corpusRef = useRef<MatcherCorpus | undefined>(undefined);
  corpusRef.current = matcherCorpus;

  // M7.1 Patch 4 — the shoe's IMMUTABLE Balanced Threshold-Lab config (BALCFG-001).
  // Recovered from the shoe's own valid locks (so it holds even under STRICT).
  // Fresh shoes (no locks) adopt the Next-Shoe preference at Start Live; legacy
  // pre-Patch-4 shoes (valid locks without BALCFG-001) stay DECISION-003
  // (undefined). Contradictory thresholds surface as an invariant error.
  const balancedConfigRef = useRef<BalancedDecisionConfig | undefined>(undefined);

  const [state, setState] = useState<SessionState | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<SessionStoreKind | null>(null);
  const [attempt, setAttempt] = useState(0);

  const forward = isForward(shoe?.environment);
  const shoeId = shoe?.id ?? null;
  const environment = shoe?.environment ?? null;

  // Keep the shoe's immutable Balanced config in sync with the persisted locks.
  useEffect(() => {
    if (!state) {
      balancedConfigRef.current = undefined;
      return;
    }
    const validLocks = state.predictions.filter((e) => !e.invalidated).map((e) => e.prediction);
    if (validLocks.length === 0) {
      balancedConfigRef.current = undefined;
      return;
    }
    try {
      const t = resolveShoeThresholdFromLocks(validLocks);
      balancedConfigRef.current = t != null ? balancedDecisionConfig(t) : undefined;
    } catch (e) {
      balancedConfigRef.current = undefined;
      setError(e instanceof Error ? e.message : 'Balanced threshold invariant violation.');
    }
  }, [state]);

  useEffect(() => {
    if (!forward || !shoeId || !environment) {
      setState(null);
      setReady(false);
      setError(null);
      return;
    }
    let mounted = true;
    setReady(false);
    setError(null);
    (async () => {
      try {
        const { store, kind: storeKind } = await createSessionStore();
        if (!mounted) return;
        storeRef.current = store;
        setKind(storeKind);
        if (storeKind === 'memory') {
          // Development diagnostic: SQLite/DB-002 is the production architecture.
          console.warn('[useLiveSession] persistence via AsyncStorage fallback (not SQLite/DB-002).');
        }
        let next = await store.reconstruct(shoeId);
        if (!next) {
          next = await store.startLive(shoeId, roundsRef.current, environment, {
            historyConfirmed: true,
            profile: getEngineMode(),
            matcherCorpus: corpusRef.current,
            balancedConfig: balancedDecisionConfig(getNextBalancedThreshold()),
          });
        }
        if (!mounted) return;
        setState(next);
        setReady(true);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : 'Failed to lock / persist the prediction.');
        setState(null);
        setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [forward, shoeId, environment, attempt]);

  const submit = useCallback(
    (winner: Winner, action: OperatorAction, pairs?: LiveSubmitPairs) => {
      const store = storeRef.current;
      const current = state;
      if (!store || !current || busy || guardRef.current.isBusy) return;
      if (!current.currentPrediction) return; // lock-before-result guard (UI)
      (async () => {
        try {
          await guardRef.current.run(async () => {
            setBusy(true);
            const next = await store.submitResult(current.shoeId, winner, {
              operatorAction: action,
              playerPair: pairs?.playerPair ?? PairState.UNKNOWN,
              bankerPair: pairs?.bankerPair ?? PairState.UNKNOWN,
              profile: getEngineMode(),
              matcherCorpus: corpusRef.current,
              balancedConfig: balancedConfigRef.current,
            });
            setState(next);
            setError(null);
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to submit the result.');
        } finally {
          setBusy(false);
        }
      })();
    },
    [state, busy],
  );

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  /**
   * Revision orchestration ONLY: routes an edit/delete through the live
   * SessionStore (which owns the accepted invalidation/renumber/rebuild
   * semantics) and refreshes state from the returned authoritative session.
   * The TransactionGuard prevents a rapid duplicate edit/delete from producing
   * duplicate revision/prediction state.
   */
  const runRevision = useCallback(
    (op: (store: SessionStore, shoeId: string) => Promise<SessionState>) => {
      const store = storeRef.current;
      const current = state;
      if (!store || !current || busy || guardRef.current.isBusy) return;
      (async () => {
        try {
          await guardRef.current.run(async () => {
            setBusy(true);
            const next = await op(store, current.shoeId);
            setState(next);
            setError(null);
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to revise history.');
        } finally {
          setBusy(false);
        }
      })();
    },
    [state, busy],
  );

  const editHistory = useCallback(
    (roundNumber: number, edit: RoundEdit) =>
      runRevision((store, shoeId) =>
        store.editHistory(shoeId, roundNumber, edit, {
          profile: getEngineMode(),
          matcherCorpus: corpusRef.current,
          balancedConfig: balancedConfigRef.current,
        }),
      ),
    [runRevision],
  );

  const deleteHistoryRound = useCallback(
    (roundNumber: number) =>
      runRevision((store, shoeId) =>
        store.deleteHistory(shoeId, roundNumber, {
          profile: getEngineMode(),
          matcherCorpus: corpusRef.current,
          balancedConfig: balancedConfigRef.current,
        }),
      ),
    [runRevision],
  );

  return {
    active: forward,
    ready,
    busy,
    state,
    lastResolved: latestResolved(state),
    error,
    storeKind: kind,
    submit,
    editHistory,
    deleteHistoryRound,
    retry,
  };
}
