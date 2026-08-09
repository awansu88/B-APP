/**
 * M7.1 Patch 1 — local UI preferences (NO DB schema; DB-002 unchanged).
 *
 * Safe presentation-only toggles persisted via AsyncStorage. These NEVER touch
 * engine configuration (reliability, voting weights, confidence thresholds /
 * cap, family correlation, risk thresholds, warm-up, matcher thresholds/Top-K).
 * A module-level external store lets any screen read/update without a provider.
 */
import { useSyncExternalStore } from 'react';

import { storage } from '@/src/utils/storage';

export interface UiPreferences {
  /** Show the non-actionable Directional Lean + Why-Skip on SKIP decisions. */
  readonly showDirectionalLean: boolean;
  /** Show the compact decision-details / comparison foundation trace. */
  readonly showDecisionDetails: boolean;
}

export const DEFAULT_PREFERENCES: UiPreferences = Object.freeze({
  showDirectionalLean: true,
  showDecisionDetails: false,
});

const KEY_LEAN = 'bapp.pref.showDirectionalLean';
const KEY_DETAILS = 'bapp.pref.showDecisionDetails';

let state: UiPreferences = { ...DEFAULT_PREFERENCES };
let hydrated = false;
const listeners = new Set<() => void>();

const emit = (): void => {
  for (const l of listeners) l();
};

async function hydrate(): Promise<void> {
  const lean = await storage.getItem(KEY_LEAN, DEFAULT_PREFERENCES.showDirectionalLean);
  const details = await storage.getItem(KEY_DETAILS, DEFAULT_PREFERENCES.showDecisionDetails);
  state = { showDirectionalLean: lean !== false, showDecisionDetails: details === true };
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

export function setShowDecisionDetails(value: boolean): void {
  if (state.showDecisionDetails === value) return;
  state = { ...state, showDecisionDetails: value };
  emit();
  void storage.setItem(KEY_DETAILS, value);
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
  readonly setShowDecisionDetails: (v: boolean) => void;
}

export function usePreferences(): UsePreferences {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    ...prefs,
    hydrated,
    setShowDirectionalLean,
    setShowDecisionDetails,
  };
}
