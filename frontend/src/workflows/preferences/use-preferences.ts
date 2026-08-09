/**
 * M7.1 Patch 1/2 — local UI + engine-mode preferences (NO DB schema; DB-002
 * unchanged, NO DB-003).
 *
 * Safe, versioned presentation/selection toggles persisted via AsyncStorage.
 * `engineMode` selects a KNOWN, versioned engine profile (STRICT / BALANCED) —
 * it does NOT expose arbitrary numeric tuning and never edits engine
 * configuration (reliability, voting weights, confidence thresholds/cap, family
 * correlation, risk thresholds, warm-up, matcher thresholds/Top-K). A
 * module-level external store lets any screen — and the session store — read the
 * current selection without a provider.
 */
import { useSyncExternalStore } from 'react';

import { storage } from '@/src/utils/storage';
import {
  DEFAULT_ENGINE_PROFILE_ID,
  isEngineProfileId,
  isBalancedThreshold,
  DEFAULT_BALANCED_THRESHOLD,
  type EngineProfileId,
  type BalancedThreshold,
} from '@/src/domain/decision';

export interface UiPreferences {
  /** Show the non-actionable Directional Lean + Why-Skip on SKIP decisions. */
  readonly showDirectionalLean: boolean;
  /** Show the compact secondary STRICT-vs-BALANCED decision-comparison section. */
  readonly showDecisionComparison: boolean;
  /** Selected engine profile (versioned). Default STRICT / DECISION-001. */
  readonly engineMode: EngineProfileId;
  /**
   * M7.1 Patch 4 — the NEXT-shoe Balanced Threshold-Lab preset. This is a
   * preference only: it becomes a shoe's immutable BALCFG-001 threshold at Start
   * Live and NEVER mutates an already-active shoe.
   */
  readonly nextBalancedThreshold: BalancedThreshold;
}

export const DEFAULT_PREFERENCES: UiPreferences = Object.freeze({
  showDirectionalLean: true,
  showDecisionComparison: false,
  engineMode: DEFAULT_ENGINE_PROFILE_ID,
  nextBalancedThreshold: DEFAULT_BALANCED_THRESHOLD,
});

const KEY_LEAN = 'bapp.pref.showDirectionalLean';
const KEY_COMPARISON = 'bapp.pref.showDecisionComparison';
const KEY_ENGINE_MODE = 'bapp.pref.engineMode';
const KEY_NEXT_THRESHOLD = 'bapp.pref.nextBalancedThreshold';

let state: UiPreferences = { ...DEFAULT_PREFERENCES };
let hydrated = false;
const listeners = new Set<() => void>();

const emit = (): void => {
  for (const l of listeners) l();
};

async function hydrate(): Promise<void> {
  const lean = await storage.getItem(KEY_LEAN, DEFAULT_PREFERENCES.showDirectionalLean);
  const comparison = await storage.getItem(
    KEY_COMPARISON,
    DEFAULT_PREFERENCES.showDecisionComparison,
  );
  const mode = await storage.getItem<string>(KEY_ENGINE_MODE, DEFAULT_PREFERENCES.engineMode);
  const nextThreshold = await storage.getItem<number>(
    KEY_NEXT_THRESHOLD,
    DEFAULT_PREFERENCES.nextBalancedThreshold,
  );
  state = {
    showDirectionalLean: lean !== false,
    showDecisionComparison: comparison === true,
    engineMode: isEngineProfileId(mode) ? mode : DEFAULT_ENGINE_PROFILE_ID,
    nextBalancedThreshold: isBalancedThreshold(nextThreshold)
      ? nextThreshold
      : DEFAULT_BALANCED_THRESHOLD,
  };
  hydrated = true;
  emit();
}
void hydrate();

export function setShowDirectionalLean(value: boolean): void {
  if (state.showDirectionalLean === value) return;
  state = { ...state, showDirectionalLean: value };
  emit();
  void storage.setItem(KEY_LEAN, value);
}

export function setShowDecisionComparison(value: boolean): void {
  if (state.showDecisionComparison === value) return;
  state = { ...state, showDecisionComparison: value };
  emit();
  void storage.setItem(KEY_COMPARISON, value);
}

export function setEngineMode(value: EngineProfileId): void {
  if (state.engineMode === value) return;
  state = { ...state, engineMode: value };
  emit();
  void storage.setItem(KEY_ENGINE_MODE, value);
}

/**
 * Synchronous read of the current engine mode for non-React callers (e.g. the
 * session store at lock time). Returns the last hydrated value (STRICT until
 * hydration completes).
 */
export function getEngineMode(): EngineProfileId {
  return state.engineMode;
}

export function setNextBalancedThreshold(value: BalancedThreshold): void {
  if (state.nextBalancedThreshold === value) return;
  state = { ...state, nextBalancedThreshold: value };
  emit();
  void storage.setItem(KEY_NEXT_THRESHOLD, value);
}

/** Synchronous read of the NEXT-shoe Balanced threshold (session store at Start Live). */
export function getNextBalancedThreshold(): BalancedThreshold {
  return state.nextBalancedThreshold;
}

const subscribe = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

const getSnapshot = (): UiPreferences => state;

export interface UsePreferences extends UiPreferences {
  readonly hydrated: boolean;
  readonly setShowDirectionalLean: (v: boolean) => void;
  readonly setShowDecisionComparison: (v: boolean) => void;
  readonly setEngineMode: (v: EngineProfileId) => void;
  readonly setNextBalancedThreshold: (v: BalancedThreshold) => void;
}

export function usePreferences(): UsePreferences {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    ...prefs,
    hydrated,
    setShowDirectionalLean,
    setShowDecisionComparison,
    setEngineMode,
    setNextBalancedThreshold,
  };
}
