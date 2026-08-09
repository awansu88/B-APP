/**
 * M7.1 Patch 3 Stage B1 — Historical Matcher AUDIT statistics foundation.
 *
 * PURE, deterministic aggregation over the IMMUTABLE pre-result `matcherAudit`
 * persisted on Patch-3 BALANCED LockedPredictions. It never recomputes matcher
 * history and never mutates anything. Pre-Patch-3 locks (no `matcherAudit`) are
 * surfaced as explicit NOT_AVAILABLE coverage — never silently dropped.
 *
 * Stage B1 ships ONLY the data foundation (no UI). Stage B2 renders it.
 */
import type { BappDataset } from '../backup';
import type { MatcherAbstainReason, MatcherSignal, MatcherStatus } from '../matcher';

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A verbatim projection of the stored matcher audit fields we aggregate on. */
export interface StoredMatcherAudit {
  readonly status?: MatcherStatus;
  readonly eligible?: boolean;
  readonly signal?: MatcherSignal;
  readonly effectiveMatches?: number;
  readonly topSimilarity?: number;
  readonly meanTopSimilarity?: number;
  readonly abstainReason?: MatcherAbstainReason;
}

export interface MatcherStatsReport {
  /** Non-invalidated locked decisions in scope. */
  readonly totalLocks: number;
  /** Locks carrying an immutable matcherAudit (coverage numerator). */
  readonly withAudit: number;
  /** Pre-Patch-3 locks without matcherAudit — NOT_AVAILABLE. */
  readonly withoutAudit: number;
  /** COLLECTING / globally-ineligible audits. */
  readonly collecting: number;
  /** ELIGIBLE evaluations (global gate passed, matcher actually ran). */
  readonly eligibleEvaluations: number;
  readonly playerSignals: number;
  readonly bankerSignals: number;
  readonly abstain: number;
  readonly abstainReasons: Readonly<Record<string, number>>;
  /** Mean effectiveMatches over ELIGIBLE evaluations; null when none. */
  readonly meanEffectiveMatches: number | null;
  /** Mean topSimilarity over ELIGIBLE evaluations; null when none. */
  readonly meanTopSimilarity: number | null;
}

/**
 * Aggregate matcher audits. `totalLocks` is the explicit coverage denominator;
 * `audits` contains one entry per lock — `null` for pre-Patch-3 locks (counted
 * as NOT_AVAILABLE, never dropped).
 */
export function aggregateMatcherAudits(
  audits: readonly (StoredMatcherAudit | null)[],
  totalLocks: number = audits.length,
): MatcherStatsReport {
  let withAudit = 0;
  let collecting = 0;
  let eligibleEvaluations = 0;
  let playerSignals = 0;
  let bankerSignals = 0;
  let abstain = 0;
  const abstainReasons: Record<string, number> = {};
  let effSum = 0;
  let simSum = 0;

  for (const a of audits) {
    if (!a) continue;
    withAudit += 1;
    if (a.status === 'ELIGIBLE') {
      eligibleEvaluations += 1;
      if (typeof a.effectiveMatches === 'number') effSum += a.effectiveMatches;
      if (typeof a.meanTopSimilarity === 'number') simSum += a.meanTopSimilarity;
    } else {
      collecting += 1;
    }
    if (a.signal === 'PLAYER') playerSignals += 1;
    else if (a.signal === 'BANKER') bankerSignals += 1;
    else {
      abstain += 1;
      const reason = a.abstainReason ?? 'UNSPECIFIED';
      abstainReasons[reason] = (abstainReasons[reason] ?? 0) + 1;
    }
  }

  return {
    totalLocks,
    withAudit,
    withoutAudit: totalLocks - withAudit,
    collecting,
    eligibleEvaluations,
    playerSignals,
    bankerSignals,
    abstain,
    abstainReasons,
    meanEffectiveMatches: eligibleEvaluations > 0 ? round4(effSum / eligibleEvaluations) : null,
    meanTopSimilarity: eligibleEvaluations > 0 ? round4(simSum / eligibleEvaluations) : null,
  };
}

function parseAudit(payload: string | null | undefined): StoredMatcherAudit | null {
  if (!payload) return null;
  try {
    const obj = JSON.parse(payload) as { matcherAudit?: StoredMatcherAudit };
    return obj?.matcherAudit ?? null;
  } catch {
    return null;
  }
}

/** Build matcher-audit statistics from the authoritative dataset projection. */
export function computeMatcherStatsFromDataset(dataset: BappDataset): MatcherStatsReport {
  const active = dataset.lockedPredictions.filter((r) => !r.invalidated);
  return aggregateMatcherAudits(active.map((r) => parseAudit(r.payload)), active.length);
}
