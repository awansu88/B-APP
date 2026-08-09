/**
 * M7.1 Patch 1 — Decision Observability adapters over the accepted read-only
 * BappDataset projection and live LockedPredictions.
 *
 * These NEVER regenerate historical predictions. They read the verbatim,
 * immutable locked-prediction payload (the exact trace the pipeline stored) and
 * classify it. When a payload lacks a field, that field is treated as
 * NOT_AVAILABLE by the core layer.
 */
import type { BappDataset, LockedPredictionEntryRecord } from '../backup/dataset';
import type { LockedPrediction } from '../session/types';
import {
  computeAvailability,
  computeMatcherReadiness,
  countCompletedShoes,
  countNonTieRounds,
  evaluateSnapshotOutcome,
  tallyObserved,
  type DecisionAvailability,
  type DecisionTraceLike,
  type MatcherReadiness,
  type ObservedOutcome,
  type ProfileObserved,
} from './decision-observability';

interface StoredPayloadTrace {
  reasonCodes?: readonly string[];
  riskFlags?: readonly string[];
  playerScore?: number;
  bankerScore?: number;
}

/** Parse the verbatim locked-prediction payload JSON; returns {} when unusable. */
function parsePayloadTrace(payload: string | null | undefined): StoredPayloadTrace {
  if (!payload) return {};
  try {
    const obj = JSON.parse(payload) as Record<string, unknown>;
    if (obj == null || typeof obj !== 'object') return {};
    const out: StoredPayloadTrace = {};
    if (Array.isArray(obj.reasonCodes)) out.reasonCodes = obj.reasonCodes as string[];
    if (Array.isArray(obj.riskFlags)) out.riskFlags = obj.riskFlags as string[];
    if (typeof obj.playerScore === 'number') out.playerScore = obj.playerScore;
    if (typeof obj.bankerScore === 'number') out.bankerScore = obj.bankerScore;
    return out;
  } catch {
    return {};
  }
}

/** Map a stored locked-prediction entry to a decision trace (authoritative decision + payload trace). */
export function recordToTrace(record: LockedPredictionEntryRecord): DecisionTraceLike {
  const t = parsePayloadTrace(record.payload);
  return {
    decision: record.decision,
    reasonCodes: t.reasonCodes,
    riskFlags: t.riskFlags,
    playerScore: t.playerScore,
    bankerScore: t.bankerScore,
  };
}

/** Map a live/persisted LockedPrediction to a decision trace (full trace always present). */
export function lockToTrace(lock: LockedPrediction): DecisionTraceLike {
  return {
    decision: lock.decision,
    reasonCodes: lock.reasonCodes as readonly string[],
    riskFlags: lock.riskFlags as readonly string[],
    playerScore: lock.playerScore,
    bankerScore: lock.bankerScore,
  };
}

/** Decision availability over all non-invalidated historical locked decisions in a dataset. */
export function computeAvailabilityFromDataset(dataset: BappDataset): DecisionAvailability {
  const traces = dataset.lockedPredictions
    .filter((r) => !r.invalidated)
    .map(recordToTrace);
  return computeAvailability(traces);
}

/** Decision availability for a single shoe's non-invalidated locked decisions. */
export function computeAvailabilityForShoe(
  dataset: BappDataset,
  shoeId: string,
): DecisionAvailability {
  const traces = dataset.lockedPredictions
    .filter((r) => r.shoeId === shoeId && !r.invalidated)
    .map(recordToTrace);
  return computeAvailability(traces);
}

/** Historical Matcher readiness derived from the authoritative shoes + rounds. */
export function matcherReadinessFromDataset(dataset: BappDataset): MatcherReadiness {
  return computeMatcherReadiness(
    countCompletedShoes(dataset.shoes),
    countNonTieRounds(dataset.rounds),
  );
}

// --- M7.1 Patch 2: profile-comparison telemetry ----------------------------

interface StoredSnapshot {
  readonly decision: string;
  readonly reasonCodes?: readonly string[];
  readonly riskFlags?: readonly string[];
  readonly playerScore?: number;
  readonly bankerScore?: number;
}

interface StoredProfileComparison {
  readonly version: string;
  readonly selectedProfile: string;
  readonly strict: StoredSnapshot;
  readonly balanced: StoredSnapshot;
}

const snapToTrace = (s: StoredSnapshot): DecisionTraceLike => ({
  decision: s.decision,
  reasonCodes: s.reasonCodes,
  riskFlags: s.riskFlags,
  playerScore: s.playerScore,
  bankerScore: s.bankerScore,
});

/** Parse the immutable `profileComparison` block from a stored payload; null when absent. */
function parseProfileComparison(payload: string | null | undefined): StoredProfileComparison | null {
  if (!payload) return null;
  try {
    const obj = JSON.parse(payload) as Record<string, unknown>;
    const cmp = obj?.profileComparison as Record<string, unknown> | undefined;
    if (!cmp || typeof cmp !== 'object') return null;
    const strict = cmp.strict as StoredSnapshot | undefined;
    const balanced = cmp.balanced as StoredSnapshot | undefined;
    if (!strict?.decision || !balanced?.decision) return null;
    return {
      version: String(cmp.version ?? 'PROFILECMP-001'),
      selectedProfile: String(cmp.selectedProfile ?? 'STRICT'),
      strict,
      balanced,
    };
  } catch {
    return null;
  }
}

export interface ProfileAvailability {
  readonly availability: DecisionAvailability;
  readonly observed: ProfileObserved;
}

export interface ProfileComparisonReport {
  /** Non-invalidated records that carry Patch-2 comparison telemetry. */
  readonly available: number;
  /** Non-invalidated records WITHOUT comparison telemetry (pre-Patch-2) — NOT_AVAILABLE. */
  readonly notAvailable: number;
  readonly selectedStrict: number;
  readonly selectedBalanced: number;
  readonly strict: ProfileAvailability;
  readonly balanced: ProfileAvailability;
}

/**
 * Compare STRICT vs BALANCED over the immutable stored comparison telemetry.
 * Pre-Patch-2 records (no telemetry) are excluded from the per-profile
 * denominators and counted as `notAvailable`. Observed W/L/P is derived from the
 * stored pre-result decision + the actual winner — it NEVER touches the played
 * or paper ledger (comparison is control telemetry only).
 */
export function computeProfileComparisonFromDataset(dataset: BappDataset): ProfileComparisonReport {
  const strictTraces: DecisionTraceLike[] = [];
  const balancedTraces: DecisionTraceLike[] = [];
  const strictOutcomes: ObservedOutcome[] = [];
  const balancedOutcomes: ObservedOutcome[] = [];
  let available = 0;
  let notAvailable = 0;
  let selectedStrict = 0;
  let selectedBalanced = 0;

  for (const r of dataset.lockedPredictions) {
    if (r.invalidated) continue;
    const cmp = parseProfileComparison(r.payload);
    if (!cmp) {
      notAvailable += 1;
      continue;
    }
    available += 1;
    if (cmp.selectedProfile === 'BALANCED') selectedBalanced += 1;
    else selectedStrict += 1;
    strictTraces.push(snapToTrace(cmp.strict));
    balancedTraces.push(snapToTrace(cmp.balanced));
    strictOutcomes.push(evaluateSnapshotOutcome(cmp.strict.decision, r.actualWinner));
    balancedOutcomes.push(evaluateSnapshotOutcome(cmp.balanced.decision, r.actualWinner));
  }

  return {
    available,
    notAvailable,
    selectedStrict,
    selectedBalanced,
    strict: { availability: computeAvailability(strictTraces), observed: tallyObserved(strictOutcomes) },
    balanced: {
      availability: computeAvailability(balancedTraces),
      observed: tallyObserved(balancedOutcomes),
    },
  };
}
