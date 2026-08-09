/**
 * M7.1 Patch 2.1 — Near-Threshold Diagnostics dataset adapters.
 *
 * Bridges the accepted read-only BappDataset projection to the pure
 * near-threshold / threshold-simulation layer. It reads the AUTHORITATIVE stored
 * fields (`decision`, `confidence`) plus the VERBATIM immutable payload trace
 * (`reasonCodes`, `riskFlags`, scores) and the immutable PROFILECMP-001
 * STRICT / BALANCED snapshots. It NEVER regenerates a historical prediction and
 * NEVER mutates any official decision / sequence / paper ledger.
 */
import type { BappDataset, LockedPredictionEntryRecord } from '../backup/dataset';
import {
  computeNearThresholdReport,
  simulateThresholds,
  type NearThresholdReport,
  type ThresholdDecisionEntry,
  type ThresholdSimulationReport,
} from './threshold-observability';

interface StoredSnapshot {
  readonly decision?: string;
  readonly confidence?: number;
  readonly reasonCodes?: readonly string[];
  readonly riskFlags?: readonly string[];
  readonly playerScore?: number;
  readonly bankerScore?: number;
}

interface StoredProfileComparison {
  readonly strict?: StoredSnapshot;
  readonly balanced?: StoredSnapshot;
}

interface ParsedPayload {
  readonly reasonCodes?: readonly string[];
  readonly riskFlags?: readonly string[];
  readonly playerScore?: number;
  readonly bankerScore?: number;
  readonly profileComparison: StoredProfileComparison | null;
}

const asStringArray = (v: unknown): readonly string[] | undefined =>
  Array.isArray(v) ? (v as string[]) : undefined;
const asNumber = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

/** Parse the verbatim locked-prediction payload JSON; returns nulls when unusable. */
function parsePayload(payload: string | null | undefined): ParsedPayload {
  if (!payload) return { profileComparison: null };
  try {
    const obj = JSON.parse(payload) as Record<string, unknown>;
    if (obj == null || typeof obj !== 'object') return { profileComparison: null };
    const cmpRaw = obj.profileComparison as Record<string, unknown> | undefined;
    let profileComparison: StoredProfileComparison | null = null;
    if (cmpRaw && typeof cmpRaw === 'object') {
      const strict = cmpRaw.strict as StoredSnapshot | undefined;
      const balanced = cmpRaw.balanced as StoredSnapshot | undefined;
      if (strict?.decision && balanced?.decision) {
        profileComparison = { strict, balanced };
      }
    }
    return {
      reasonCodes: asStringArray(obj.reasonCodes),
      riskFlags: asStringArray(obj.riskFlags),
      playerScore: asNumber(obj.playerScore),
      bankerScore: asNumber(obj.bankerScore),
      profileComparison,
    };
  } catch {
    return { profileComparison: null };
  }
}

/** Map a stored record to the OFFICIAL (selected-profile) decision entry. */
function recordToOfficialEntry(record: LockedPredictionEntryRecord): ThresholdDecisionEntry {
  const p = parsePayload(record.payload);
  return {
    decision: record.decision,
    confidence: typeof record.confidence === 'number' ? record.confidence : null,
    reasonCodes: p.reasonCodes,
    riskFlags: p.riskFlags,
    playerScore: p.playerScore,
    bankerScore: p.bankerScore,
  };
}

const snapshotToEntry = (s: StoredSnapshot): ThresholdDecisionEntry => ({
  decision: String(s.decision),
  confidence: typeof s.confidence === 'number' ? s.confidence : null,
  reasonCodes: s.reasonCodes,
  riskFlags: s.riskFlags,
  playerScore: s.playerScore,
  bankerScore: s.bankerScore,
});

export interface ComparisonCoverage {
  /** Non-invalidated locked decisions in scope. */
  readonly total: number;
  /** Records carrying PROFILECMP-001 STRICT + BALANCED snapshots. */
  readonly withComparison: number;
  /** Pre-PROFILECMP records — comparison = NOT_AVAILABLE (never regenerated). */
  readonly withoutComparison: number;
}

export interface NearThresholdDatasetReport {
  /** Official (selected-profile) near-threshold diagnostics + simulation. */
  readonly official: NearThresholdReport;
  readonly simulation: ThresholdSimulationReport;
  /** Per-profile diagnostics from immutable PROFILECMP-001 snapshots. */
  readonly strict: NearThresholdReport;
  readonly balanced: NearThresholdReport;
  readonly strictSimulation: ThresholdSimulationReport;
  readonly balancedSimulation: ThresholdSimulationReport;
  readonly comparisonCoverage: ComparisonCoverage;
}

/**
 * Build the full near-threshold dataset report. Only non-invalidated locked
 * decisions are considered. STRICT / BALANCED diagnostics use ONLY records that
 * carry immutable PROFILECMP-001 telemetry; pre-PROFILECMP records are surfaced
 * as explicit NOT_AVAILABLE comparison coverage (never regenerated).
 */
export function computeNearThresholdFromDataset(dataset: BappDataset): NearThresholdDatasetReport {
  const active = dataset.lockedPredictions.filter((r) => !r.invalidated);

  const officialEntries: ThresholdDecisionEntry[] = [];
  const strictEntries: ThresholdDecisionEntry[] = [];
  const balancedEntries: ThresholdDecisionEntry[] = [];
  let withComparison = 0;

  for (const r of active) {
    officialEntries.push(recordToOfficialEntry(r));
    const cmp = parsePayload(r.payload).profileComparison;
    if (cmp?.strict?.decision && cmp?.balanced?.decision) {
      withComparison += 1;
      strictEntries.push(snapshotToEntry(cmp.strict));
      balancedEntries.push(snapshotToEntry(cmp.balanced));
    }
  }

  return {
    official: computeNearThresholdReport(officialEntries),
    simulation: simulateThresholds(officialEntries),
    strict: computeNearThresholdReport(strictEntries),
    balanced: computeNearThresholdReport(balancedEntries),
    strictSimulation: simulateThresholds(strictEntries),
    balancedSimulation: simulateThresholds(balancedEntries),
    comparisonCoverage: {
      total: active.length,
      withComparison,
      withoutComparison: active.length - withComparison,
    },
  };
}
