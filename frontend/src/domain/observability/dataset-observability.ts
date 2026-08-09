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
  type DecisionAvailability,
  type DecisionTraceLike,
  type MatcherReadiness,
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
