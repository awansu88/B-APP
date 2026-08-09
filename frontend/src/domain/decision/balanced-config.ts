/**
 * M7.1 Patch 4 — Balanced Threshold Lab configuration (DECISION-004 / BALCFG-001).
 *
 * DECISION-004 preserves DECISION-003 behavior EXACTLY except for a single
 * versioned per-shoe value: the BET/SKIP confidence FLOOR (`threshold`). The
 * confidence formula, analyzer activation, HMATCH-002, VOTE-001, family
 * correlation, Data Quality Gate, support/agreement requirements, conflict and
 * risk logic, and the confidence cap are all UNCHANGED. Only the accepted
 * threshold floor becomes the immutable per-shoe BALCFG-001 value.
 *
 * The threshold is a SHOE-LEVEL experiment configuration (not merely an
 * attribute of an official BALANCED lock): it is recoverable from the shoe's
 * immutable locks even when STRICT is the selected official profile.
 */
import { DECISION_CONFIG, type DecisionConfig } from './config';

export const DECISION_004_VERSION = 'DECISION-004';
export const BALANCED_CONFIG_VERSION = 'BALCFG-001';

/** The ONLY user-selectable Balanced thresholds (fixed presets — no free entry). */
export type BalancedThreshold = 0.55 | 0.54 | 0.53 | 0.52;
export const BALANCED_THRESHOLD_PRESETS: readonly BalancedThreshold[] = Object.freeze([
  0.55, 0.54, 0.53, 0.52,
]);
/** Default Next-Shoe preference for new installs (does NOT alter active shoes). */
export const DEFAULT_BALANCED_THRESHOLD: BalancedThreshold = 0.53;

export const isBalancedThreshold = (v: unknown): v is BalancedThreshold =>
  v === 0.55 || v === 0.54 || v === 0.53 || v === 0.52;

/** Immutable per-shoe Balanced experiment configuration. */
export interface BalancedDecisionConfig {
  readonly configVersion: typeof BALANCED_CONFIG_VERSION;
  readonly threshold: BalancedThreshold;
}

export function balancedDecisionConfig(threshold: BalancedThreshold): BalancedDecisionConfig {
  return Object.freeze({ configVersion: BALANCED_CONFIG_VERSION, threshold });
}

/**
 * Derive the DECISION-004 DecisionConfig: DECISION-001 baseline with ONLY the
 * BET/SKIP floor replaced by the per-shoe threshold. Nothing else changes.
 */
export function decisionConfigForBalanced(bc: BalancedDecisionConfig): DecisionConfig {
  return Object.freeze({ ...DECISION_CONFIG, betThreshold: bc.threshold });
}

/** Raised when a single shoe carries contradictory BALCFG-001 thresholds. */
export class BalancedThresholdInvariantError extends Error {
  constructor(readonly thresholds: readonly number[]) {
    super(
      `Invariant violation: a shoe has contradictory BALCFG-001 thresholds [${thresholds.join(
        ', ',
      )}]. The per-shoe Balanced threshold is immutable once locked.`,
    );
    this.name = 'BalancedThresholdInvariantError';
  }
}

/** Minimal projection of a lock needed to recover the shoe's Balanced threshold. */
export interface BalcfgLockView {
  readonly balancedConfigVersion?: string;
  readonly balancedThreshold?: number;
}

/**
 * Recover the shoe's locked Balanced threshold from its (valid) locks.
 * - Returns the single BALCFG-001 threshold shared by every DECISION-004 lock.
 * - Returns `null` when NO lock carries BALCFG-001 (fresh shoe OR a legacy
 *   pre-Patch-4 shoe — the caller distinguishes those by lock presence).
 * - Throws BalancedThresholdInvariantError when locks disagree (never silently
 *   picks the newest).
 */
export function resolveShoeThresholdFromLocks(
  locks: readonly BalcfgLockView[],
): BalancedThreshold | null {
  const found = new Set<number>();
  for (const l of locks) {
    if (l.balancedConfigVersion === BALANCED_CONFIG_VERSION && typeof l.balancedThreshold === 'number') {
      found.add(l.balancedThreshold);
    }
  }
  if (found.size > 1) throw new BalancedThresholdInvariantError([...found].sort());
  if (found.size === 1) {
    const t = [...found][0];
    return isBalancedThreshold(t) ? t : null;
  }
  return null;
}
