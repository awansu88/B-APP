/**
 * M7.1 Patch 2.1 — Near-Threshold Diagnostics + Safe Threshold Simulation.
 *
 * A PURE, deterministic, OBSERVABILITY-ONLY layer over the IMMUTABLE stored
 * decision trace produced by the accepted pipeline (DECISION-001 / DECISION-002).
 *
 * It NEVER:
 *   - recomputes prediction mathematics,
 *   - mutates any official decision, Engine Sequence, Played Sequence or paper
 *     ledger,
 *   - persists a simulated decision.
 *
 * It only classifies + aggregates fields the pipeline already emitted and
 * persisted verbatim (`decision`, `confidence`, `reasonCodes`, `riskFlags`,
 * `playerScore`, `bankerScore`). Where the stored trace is insufficient, a value
 * is reported as NOT_AVAILABLE — historical LockedPredictions are never
 * regenerated.
 *
 * Threshold semantics (production is FIXED at 0.55 for BOTH profiles):
 * the future BALANCED Experimental presets (0.55 / 0.54 / 0.53 / 0.52) are
 * measured here ONLY informationally. Nothing here changes production behavior.
 */
import {
  deriveSkipDiagnostic,
  SkipReason,
  type DecisionTraceLike,
} from './decision-observability';

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

// --- Confidence distribution buckets (exact numeric half-open ranges) -------

export enum ConfidenceBucket {
  /** confidence < 0.50 */
  LT_050 = 'LT_050',
  /** 0.50 <= confidence < 0.52 */
  B_050_052 = 'B_050_052',
  /** 0.52 <= confidence < 0.53 */
  B_052_053 = 'B_052_053',
  /** 0.53 <= confidence < 0.54 */
  B_053_054 = 'B_053_054',
  /** 0.54 <= confidence < 0.55 */
  B_054_055 = 'B_054_055',
  /** confidence >= 0.55 */
  GTE_055 = 'GTE_055',
}

export const CONFIDENCE_BUCKET_ORDER: readonly ConfidenceBucket[] = Object.freeze([
  ConfidenceBucket.LT_050,
  ConfidenceBucket.B_050_052,
  ConfidenceBucket.B_052_053,
  ConfidenceBucket.B_053_054,
  ConfidenceBucket.B_054_055,
  ConfidenceBucket.GTE_055,
]);

/** UI-only labels. Implementation always uses exact numeric comparisons. */
export const CONFIDENCE_BUCKET_LABEL: Readonly<Record<ConfidenceBucket, string>> = Object.freeze({
  [ConfidenceBucket.LT_050]: '< 0.50',
  [ConfidenceBucket.B_050_052]: '0.50–0.519',
  [ConfidenceBucket.B_052_053]: '0.52–0.529',
  [ConfidenceBucket.B_053_054]: '0.53–0.539',
  [ConfidenceBucket.B_054_055]: '0.54–0.549',
  [ConfidenceBucket.GTE_055]: '>= 0.55',
});

/** Classify a confidence value into a bucket using EXACT numeric comparisons. */
export function bucketConfidence(confidence: number): ConfidenceBucket {
  if (confidence < 0.5) return ConfidenceBucket.LT_050;
  if (confidence < 0.52) return ConfidenceBucket.B_050_052;
  if (confidence < 0.53) return ConfidenceBucket.B_052_053;
  if (confidence < 0.54) return ConfidenceBucket.B_053_054;
  if (confidence < 0.55) return ConfidenceBucket.B_054_055;
  return ConfidenceBucket.GTE_055;
}

// --- Near-threshold definition ---------------------------------------------

/** Production BALANCED / STRICT confidence threshold (FIXED). */
export const PRODUCTION_THRESHOLD = 0.55;
/** Lower edge of the near-threshold window (inclusive). */
export const NEAR_THRESHOLD_LOW = 0.52;

/** A near-threshold confidence is 0.52 <= c < 0.55 (exact numeric comparison). */
export function isNearThresholdConfidence(confidence: number): boolean {
  return confidence >= NEAR_THRESHOLD_LOW && confidence < PRODUCTION_THRESHOLD;
}

// --- THRESHOLD-ONLY classification ------------------------------------------

export type ThresholdClassification = 'THRESHOLD_ONLY' | 'OTHER_GATE' | 'NOT_AVAILABLE';

/**
 * Classify WHY a stored SKIP was blocked, using ONLY the immutable stored trace.
 *
 * THRESHOLD_ONLY is asserted iff ALL mandatory non-threshold gates are PROVEN
 * PASS and the confidence threshold was the sole remaining BET blocker:
 *
 *   1. `INSUFFICIENT_EVIDENCE` present — the pipeline emits this reason ONLY
 *      when a directional winner exists, directional modules >= min, and
 *      weighted agreement >= min ALL passed, AND the only reason the category
 *      fell to BELOW_THRESHOLD was rawConfidence < 0.55.
 *   2. `DATA_QUALITY_PASS` present — the Data Quality Gate did not BLOCK or
 *      LIMIT (both are independent non-threshold effects).
 *   3. No `STRONG_OPPOSITION` risk flag — strong opposition is an independent
 *      hard SKIP.
 *   4. Soft-risk count <= 1 — at a lowered threshold the category would be
 *      EXPERIMENTAL; the accepted risk filter RETAINS a BET only with <= 1 soft
 *      flag (exactly 2 => one-step downgrade back to BELOW_THRESHOLD => SKIP;
 *      >= 3 => multiple-risk SKIP).
 *
 * Any missing mandatory trace => NOT_AVAILABLE. Anything else => OTHER_GATE.
 * This never infers THRESHOLD_ONLY purely from a near-threshold confidence.
 */
export function classifyThresholdBlocker(
  reasonCodes: readonly string[] | undefined | null,
  riskFlags: readonly string[] | undefined | null,
): ThresholdClassification {
  if (reasonCodes == null) return 'NOT_AVAILABLE';
  const rc = new Set(reasonCodes);
  if (!rc.has('INSUFFICIENT_EVIDENCE')) return 'OTHER_GATE';
  if (!rc.has('DATA_QUALITY_PASS')) return 'OTHER_GATE';
  const flags = riskFlags ?? [];
  if (flags.includes('STRONG_OPPOSITION')) return 'OTHER_GATE';
  const softCount = flags.filter((f) => f !== 'STRONG_OPPOSITION').length;
  if (softCount > 1) return 'OTHER_GATE';
  return 'THRESHOLD_ONLY';
}

// --- Decision entry (verbatim stored trace projection) ----------------------

export interface ThresholdDecisionEntry {
  /** PredictionDecision string: 'BET_PLAYER' | 'BET_BANKER' | 'SKIP'. */
  readonly decision: string;
  /** Stored (immutable) confidence; null/undefined when the field is absent. */
  readonly confidence: number | null | undefined;
  readonly reasonCodes?: readonly string[];
  readonly riskFlags?: readonly string[];
  readonly playerScore?: number;
  readonly bankerScore?: number;
}

const isBet = (decision: string): boolean =>
  decision === 'BET_PLAYER' || decision === 'BET_BANKER';

const emptyBucketCounts = (): Record<ConfidenceBucket, number> => ({
  [ConfidenceBucket.LT_050]: 0,
  [ConfidenceBucket.B_050_052]: 0,
  [ConfidenceBucket.B_052_053]: 0,
  [ConfidenceBucket.B_053_054]: 0,
  [ConfidenceBucket.B_054_055]: 0,
  [ConfidenceBucket.GTE_055]: 0,
});

const emptySkipReasonCounts = (): Record<SkipReason, number> => ({
  [SkipReason.DATA_QUALITY_BLOCK]: 0,
  [SkipReason.STRONG_OPPOSITION]: 0,
  [SkipReason.RISK_FILTER]: 0,
  [SkipReason.CONFLICT]: 0,
  [SkipReason.SINGLE_FAMILY_SUPPORT]: 0,
  [SkipReason.INSUFFICIENT_DIRECTIONAL_SUPPORT]: 0,
  [SkipReason.BELOW_THRESHOLD]: 0,
  [SkipReason.REGIME_TRANSITION]: 0,
  [SkipReason.OTHER_ACCEPTED_PIPELINE_REASON]: 0,
  [SkipReason.NOT_AVAILABLE]: 0,
});

// --- Near-threshold diagnostics aggregate -----------------------------------

export interface ClassificationCounts {
  readonly thresholdOnly: number;
  readonly otherGate: number;
  readonly notAvailable: number;
}

export interface NearThresholdReport {
  /** All eligible decisions in scope (official BET + official SKIP). */
  readonly eligible: number;
  readonly officialBet: number;
  readonly officialSkip: number;
  /** SKIPs with a stored numeric confidence (analyzable coverage numerator). */
  readonly analyzableSkip: number;
  /** SKIPs missing a stored confidence — NOT_AVAILABLE (kept in coverage). */
  readonly unavailableSkip: number;
  /** Analyzable SKIPs with 0.52 <= confidence < 0.55. */
  readonly nearThresholdSkip: number;
  /** nearThresholdSkip / analyzableSkip; null when no analyzable SKIPs. */
  readonly nearThresholdPct: number | null;
  /** Confidence distribution over ANALYZABLE SKIPs (buckets A–F). */
  readonly distribution: Readonly<Record<ConfidenceBucket, number>>;
  /** Primary SKIP-reason counts within the near-threshold window (0.52–<0.55). */
  readonly nearThresholdReasons: Readonly<Record<SkipReason, number>>;
  /** THRESHOLD_ONLY / OTHER_GATE / NOT_AVAILABLE over ANALYZABLE SKIPs. */
  readonly classification: ClassificationCounts;
}

/**
 * Compute the deterministic near-threshold diagnostics over a set of stored
 * decision entries. Unavailable records are never silently dropped — they are
 * surfaced as explicit NOT_AVAILABLE coverage.
 */
export function computeNearThresholdReport(
  entries: readonly ThresholdDecisionEntry[],
): NearThresholdReport {
  let officialBet = 0;
  let officialSkip = 0;
  let analyzableSkip = 0;
  let unavailableSkip = 0;
  let nearThresholdSkip = 0;
  let thresholdOnly = 0;
  let otherGate = 0;
  let notAvailable = 0;
  const distribution = emptyBucketCounts();
  const nearThresholdReasons = emptySkipReasonCounts();

  for (const e of entries) {
    if (isBet(e.decision)) {
      officialBet += 1;
      continue;
    }
    if (e.decision !== 'SKIP') continue; // ignore anything non-eligible
    officialSkip += 1;
    if (typeof e.confidence !== 'number') {
      unavailableSkip += 1;
      continue;
    }
    analyzableSkip += 1;
    distribution[bucketConfidence(e.confidence)] += 1;

    const klass = classifyThresholdBlocker(e.reasonCodes, e.riskFlags);
    if (klass === 'THRESHOLD_ONLY') thresholdOnly += 1;
    else if (klass === 'OTHER_GATE') otherGate += 1;
    else notAvailable += 1;

    if (isNearThresholdConfidence(e.confidence)) {
      nearThresholdSkip += 1;
      const diag = deriveSkipDiagnostic({
        decision: e.decision,
        reasonCodes: e.reasonCodes,
        riskFlags: e.riskFlags,
        playerScore: e.playerScore,
        bankerScore: e.bankerScore,
      } as DecisionTraceLike);
      if (diag.primaryReason) nearThresholdReasons[diag.primaryReason] += 1;
    }
  }

  return {
    eligible: officialBet + officialSkip,
    officialBet,
    officialSkip,
    analyzableSkip,
    unavailableSkip,
    nearThresholdSkip,
    nearThresholdPct: analyzableSkip > 0 ? round4(nearThresholdSkip / analyzableSkip) : null,
    distribution,
    nearThresholdReasons,
    classification: { thresholdOnly, otherGate, notAvailable },
  };
}

// --- Safe Balanced threshold simulation (INFORMATIONAL ONLY) ----------------

/** Future approved BALANCED Experimental presets. Production remains 0.55. */
export const SIMULATION_THRESHOLDS: readonly number[] = Object.freeze([0.55, 0.54, 0.53, 0.52]);

export interface ThresholdSimResult {
  readonly threshold: number;
  /** Analyzable eligible denominator (official BET + official SKIP). */
  readonly denominator: number;
  readonly officialBet: number;
  /** THRESHOLD_ONLY SKIPs that would flip to BET at this threshold. */
  readonly additionalPotentialBet: number;
  readonly totalPotentialBet: number;
  /** totalPotentialBet / denominator; null when denominator is zero. */
  readonly potentialBetRate: number | null;
}

export interface ThresholdSimulationReport {
  /** SAFE_THRESHOLD_SIMULATION — true because immutable trace is sufficient. */
  readonly available: boolean;
  readonly denominator: number;
  readonly results: readonly ThresholdSimResult[];
}

/**
 * Simulate potential BET availability at each threshold. A SKIP contributes a
 * SIMULATED POTENTIAL BET at threshold T iff it is proven THRESHOLD_ONLY AND its
 * stored confidence >= T. OTHER_GATE and NOT_AVAILABLE records NEVER convert.
 * This is INFORMATIONAL only — it never mutates production output.
 */
export function simulateThresholds(
  entries: readonly ThresholdDecisionEntry[],
  thresholds: readonly number[] = SIMULATION_THRESHOLDS,
): ThresholdSimulationReport {
  let officialBet = 0;
  let officialSkip = 0;
  const thresholdOnlyConfidences: number[] = [];

  for (const e of entries) {
    if (isBet(e.decision)) {
      officialBet += 1;
      continue;
    }
    if (e.decision !== 'SKIP') continue;
    officialSkip += 1;
    if (typeof e.confidence !== 'number') continue;
    if (classifyThresholdBlocker(e.reasonCodes, e.riskFlags) === 'THRESHOLD_ONLY') {
      thresholdOnlyConfidences.push(e.confidence);
    }
  }

  const denominator = officialBet + officialSkip;
  const results = thresholds.map((threshold) => {
    const additionalPotentialBet = thresholdOnlyConfidences.filter((c) => c >= threshold).length;
    const totalPotentialBet = officialBet + additionalPotentialBet;
    return {
      threshold,
      denominator,
      officialBet,
      additionalPotentialBet,
      totalPotentialBet,
      potentialBetRate: denominator > 0 ? round4(totalPotentialBet / denominator) : null,
    };
  });

  return { available: true, denominator, results };
}
