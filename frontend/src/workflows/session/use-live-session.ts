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
import {
  OperatorAction,
  StepResult,
  type PredictionEntry,
  type SessionState,
} from '@/src/domain/session';
import { createSessionStore } from './create-session-store';
import type { SessionStore, SessionStoreKind } from './session-store';

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

  const [state, setState] = useState<SessionState | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<SessionStoreKind | null>(null);
  const [attempt, setAttempt] = useState(0);

  const forward = isForward(shoe?.environment);
  const shoeId = shoe?.id ?? null;
  const environment = shoe?.environment ?? null;

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

  return {
    active: forward,
    ready,
    busy,
    state,
    lastResolved: latestResolved(state),
    error,
    storeKind: kind,
    submit,
    retry,
  };
}
