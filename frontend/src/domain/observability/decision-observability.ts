/**
 * M7.1 Patch 1 — Decision Observability (pure, deterministic).
 *
 * A READ-ONLY explanatory layer over the ALREADY-PRODUCED accepted decision
 * trace. It NEVER recomputes prediction mathematics and NEVER changes the
 * result produced by DECISION-001. It only classifies/aggregates trace that the
 * pipeline already emitted (`reasonCodes`, `riskFlags`, `playerScore`,
 * `bankerScore`) and that is persisted verbatim on each LockedPrediction /
 * locked-prediction-entry payload.
 *
 * Where historical stored trace is insufficient for a field, that field is
 * reported as NOT_AVAILABLE — historical LockedPredictions are never regenerated.
 */
import { ShoeStatus } from '../models/enums';
import { Winner } from '../models/outcome';
import type { RoundRecord } from '../models/round';
import type { ShoeRecord } from '../models/records';
import type { ModuleAnalysis } from '../analysis/types';
import { computeVoting } from '../decision/voting';
import { DECISION_CONFIG } from '../decision/config';
import { ModuleFamily } from '../decision/types';

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

// --- Directional Lean (non-actionable) -------------------------------------

export enum LeanSide {
  PLAYER = 'PLAYER',
  BANKER = 'BANKER',
  NONE = 'NONE',
}

export interface DirectionalLean {
  readonly side: LeanSide;
  /** Evidence share of the leaning side (max/(player+banker)); null when no directional evidence. */
  readonly evidenceShare: number | null;
  readonly hasEvidence: boolean;
}

/**
 * Directional Lean from the accepted independent Player/Banker family scores.
 * NOT a probability / win-rate / accuracy — purely which side had more of the
 * evidence the pipeline already computed.
 */
export function deriveDirectionalLean(
  playerScore: number | undefined,
  bankerScore: number | undefined,
): DirectionalLean {
  if (playerScore == null || bankerScore == null) {
    return { side: LeanSide.NONE, evidenceShare: null, hasEvidence: false };
  }
  const total = playerScore + bankerScore;
  if (total <= 0) {
    return { side: LeanSide.NONE, evidenceShare: null, hasEvidence: false };
  }
  const side =
    playerScore > bankerScore
      ? LeanSide.PLAYER
      : bankerScore > playerScore
        ? LeanSide.BANKER
        : LeanSide.NONE;
  return { side, evidenceShare: round4(Math.max(playerScore, bankerScore) / total), hasEvidence: true };
}

// --- SKIP reason ------------------------------------------------------------

export enum SkipReason {
  DATA_QUALITY_BLOCK = 'DATA_QUALITY_BLOCK',
  STRONG_OPPOSITION = 'STRONG_OPPOSITION',
  RISK_FILTER = 'RISK_FILTER',
  CONFLICT = 'CONFLICT',
  SINGLE_FAMILY_SUPPORT = 'SINGLE_FAMILY_SUPPORT',
  INSUFFICIENT_DIRECTIONAL_SUPPORT = 'INSUFFICIENT_DIRECTIONAL_SUPPORT',
  BELOW_THRESHOLD = 'BELOW_THRESHOLD',
  REGIME_TRANSITION = 'REGIME_TRANSITION',
  OTHER_ACCEPTED_PIPELINE_REASON = 'OTHER_ACCEPTED_PIPELINE_REASON',
  NOT_AVAILABLE = 'NOT_AVAILABLE',
}

/** Deterministic precedence (highest first) when multiple reasons apply. */
export const SKIP_REASON_PRECEDENCE: readonly SkipReason[] = Object.freeze([
  SkipReason.DATA_QUALITY_BLOCK,
  SkipReason.STRONG_OPPOSITION,
  SkipReason.RISK_FILTER,
  SkipReason.CONFLICT,
  SkipReason.SINGLE_FAMILY_SUPPORT,
  SkipReason.INSUFFICIENT_DIRECTIONAL_SUPPORT,
  SkipReason.BELOW_THRESHOLD,
  SkipReason.REGIME_TRANSITION,
  SkipReason.OTHER_ACCEPTED_PIPELINE_REASON,
]);

export const SKIP_REASON_LABEL: Readonly<Record<SkipReason, string>> = Object.freeze({
  [SkipReason.DATA_QUALITY_BLOCK]: 'Data quality block',
  [SkipReason.STRONG_OPPOSITION]: 'Strong opposition',
  [SkipReason.RISK_FILTER]: 'Multiple risk filters',
  [SkipReason.CONFLICT]: 'Signal conflict',
  [SkipReason.SINGLE_FAMILY_SUPPORT]: 'Single-family support',
  [SkipReason.INSUFFICIENT_DIRECTIONAL_SUPPORT]: 'Insufficient directional support',
  [SkipReason.BELOW_THRESHOLD]: 'Below bet threshold',
  [SkipReason.REGIME_TRANSITION]: 'Regime transition',
  [SkipReason.OTHER_ACCEPTED_PIPELINE_REASON]: 'Other (accepted pipeline)',
  [SkipReason.NOT_AVAILABLE]: 'Not available',
});

/** Minimal decision-trace shape shared by live locks and stored payloads. */
export interface DecisionTraceLike {
  /** PredictionDecision string: 'BET_PLAYER' | 'BET_BANKER' | 'SKIP'. */
  readonly decision: string;
  readonly reasonCodes?: readonly string[];
  readonly riskFlags?: readonly string[];
  readonly playerScore?: number;
  readonly bankerScore?: number;
}

export interface SkipDiagnostic {
  readonly isSkip: boolean;
  /** False when the stored trace was insufficient to classify a SKIP. */
  readonly traceAvailable: boolean;
  /** Highest-precedence reason; null for a BET; NOT_AVAILABLE for an untraced SKIP. */
  readonly primaryReason: SkipReason | null;
  readonly reasons: readonly SkipReason[];
  readonly lean: DirectionalLean;
}

/** Map accepted trace codes to the stable SKIP reason list, in precedence order. */
function matchedReasons(
  reasonCodes: readonly string[],
  riskFlags: readonly string[],
): SkipReason[] {
  const rc = new Set(reasonCodes);
  const rf = new Set(riskFlags);
  const out: SkipReason[] = [];
  if (rc.has('DATA_QUALITY_BLOCK')) out.push(SkipReason.DATA_QUALITY_BLOCK);
  if (rc.has('STRONG_OPPOSITION_SKIP') || rf.has('STRONG_OPPOSITION')) {
    out.push(SkipReason.STRONG_OPPOSITION);
  }
  if (rc.has('MULTIPLE_RISK_SKIP')) out.push(SkipReason.RISK_FILTER);
  if (rf.has('MODERATE_CONFLICT')) out.push(SkipReason.CONFLICT);
  if (rf.has('SINGLE_FAMILY_SUPPORT')) out.push(SkipReason.SINGLE_FAMILY_SUPPORT);
  if (rc.has('NO_DIRECTIONAL_SIGNAL') || rc.has('INSUFFICIENT_DIRECTIONAL_MODULES')) {
    out.push(SkipReason.INSUFFICIENT_DIRECTIONAL_SUPPORT);
  }
  if (rc.has('BELOW_MIN_AGREEMENT') || rc.has('INSUFFICIENT_EVIDENCE')) {
    out.push(SkipReason.BELOW_THRESHOLD);
  }
  if (rf.has('REGIME_TRANSITION')) out.push(SkipReason.REGIME_TRANSITION);
  return out; // already in precedence order by construction
}

/**
 * Explain a single accepted decision. For a BET the official recommendation is
 * unchanged and no SKIP reason is produced. For a SKIP, derive the reason(s)
 * from the stored trace; if the trace is missing, report NOT_AVAILABLE.
 */
export function deriveSkipDiagnostic(trace: DecisionTraceLike): SkipDiagnostic {
  const isSkip = trace.decision === 'SKIP';
  const lean = deriveDirectionalLean(trace.playerScore, trace.bankerScore);
  const hasReasonTrace = trace.reasonCodes != null;

  if (!isSkip) {
    return { isSkip: false, traceAvailable: hasReasonTrace, primaryReason: null, reasons: [], lean };
  }
  if (!hasReasonTrace) {
    return {
      isSkip: true,
      traceAvailable: false,
      primaryReason: SkipReason.NOT_AVAILABLE,
      reasons: [SkipReason.NOT_AVAILABLE],
      lean,
    };
  }
  const matched = matchedReasons(trace.reasonCodes ?? [], trace.riskFlags ?? []);
  const reasons = matched.length > 0 ? matched : [SkipReason.OTHER_ACCEPTED_PIPELINE_REASON];
  return { isSkip: true, traceAvailable: true, primaryReason: reasons[0], reasons, lean };
}

// --- Decision availability aggregate ---------------------------------------

export interface DecisionAvailability {
  readonly eligible: number;
  readonly bet: number;
  readonly skip: number;
  /** bet / eligible, or null when there are zero eligible decisions. */
  readonly betRate: number | null;
  readonly skipRate: number | null;
  readonly leanPlayer: number;
  readonly leanBanker: number;
  readonly leanNone: number;
  readonly skipReasonCounts: Readonly<Record<SkipReason, number>>;
  /** SKIPs whose stored trace was insufficient to classify. */
  readonly traceUnavailable: number;
}

const emptyReasonCounts = (): Record<SkipReason, number> => ({
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

/**
 * Aggregate BET availability and SKIP breakdown over a set of decision traces.
 * Explicit denominators: `eligible` is the denominator for every rate.
 */
export function computeAvailability(traces: readonly DecisionTraceLike[]): DecisionAvailability {
  const eligible = traces.length;
  let bet = 0;
  let skip = 0;
  let leanPlayer = 0;
  let leanBanker = 0;
  let leanNone = 0;
  let traceUnavailable = 0;
  const skipReasonCounts = emptyReasonCounts();

  for (const t of traces) {
    const diag = deriveSkipDiagnostic(t);
    if (diag.isSkip) {
      skip += 1;
      if (!diag.traceAvailable) traceUnavailable += 1;
      if (diag.primaryReason) skipReasonCounts[diag.primaryReason] += 1;
      if (diag.lean.side === LeanSide.PLAYER) leanPlayer += 1;
      else if (diag.lean.side === LeanSide.BANKER) leanBanker += 1;
      else leanNone += 1;
    } else if (t.decision === 'BET_PLAYER' || t.decision === 'BET_BANKER') {
      bet += 1;
    }
  }

  return {
    eligible,
    bet,
    skip,
    betRate: eligible > 0 ? round4(bet / eligible) : null,
    skipRate: eligible > 0 ? round4(skip / eligible) : null,
    leanPlayer,
    leanBanker,
    leanNone,
    skipReasonCounts,
    traceUnavailable,
  };
}

/** Top SKIP reasons (descending count, then precedence order), excluding zero counts. */
export function topSkipReasons(
  availability: DecisionAvailability,
  limit = 3,
): readonly { reason: SkipReason; count: number }[] {
  const precedenceIndex = (r: SkipReason): number => {
    const i = SKIP_REASON_PRECEDENCE.indexOf(r);
    return i < 0 ? SKIP_REASON_PRECEDENCE.length : i;
  };
  return (Object.keys(availability.skipReasonCounts) as SkipReason[])
    .map((reason) => ({ reason, count: availability.skipReasonCounts[reason] }))
    .filter((e) => e.count > 0)
    .sort((a, b) => (b.count - a.count) || (precedenceIndex(a.reason) - precedenceIndex(b.reason)))
    .slice(0, limit);
}

// --- Historical Matcher readiness (pure) -----------------------------------

export const MATCHER_REQUIRED_SHOES = 100;
export const MATCHER_REQUIRED_NONTIE_ROUNDS = 5000;

export type MatcherEligibility = 'COLLECTING' | 'ELIGIBLE';

export interface MatcherReadiness {
  readonly completedShoes: number;
  readonly nonTieRounds: number;
  readonly requiredShoes: number;
  readonly requiredNonTieRounds: number;
  readonly eligibility: MatcherEligibility;
  /** Collection is conceptually active from the first persisted shoe (no user action). */
  readonly collectionActive: true;
  /** Voting stays disabled in DECISION-001 even when ELIGIBLE. */
  readonly votingEnabled: false;
}

/**
 * Deterministic readiness. ELIGIBLE requires BOTH thresholds. ELIGIBLE does NOT
 * activate the Historical Matcher — voting remains disabled in this patch.
 */
export function computeMatcherReadiness(
  completedShoes: number,
  nonTieRounds: number,
): MatcherReadiness {
  const eligible =
    completedShoes >= MATCHER_REQUIRED_SHOES && nonTieRounds >= MATCHER_REQUIRED_NONTIE_ROUNDS;
  return {
    completedShoes,
    nonTieRounds,
    requiredShoes: MATCHER_REQUIRED_SHOES,
    requiredNonTieRounds: MATCHER_REQUIRED_NONTIE_ROUNDS,
    eligibility: eligible ? 'ELIGIBLE' : 'COLLECTING',
    collectionActive: true,
    votingEnabled: false,
  };
}

/** A shoe is "completed" when it has left ACTIVE (COMPLETED or ARCHIVED) — DB-002 semantics. */
export function countCompletedShoes(shoes: readonly ShoeRecord[]): number {
  return shoes.filter(
    (s) => s.status === ShoeStatus.COMPLETED || s.status === ShoeStatus.ARCHIVED,
  ).length;
}

export function countNonTieRounds(rounds: readonly RoundRecord[]): number {
  return rounds.filter((r) => r.winner !== Winner.TIE).length;
}

// --- Optional decision-details (family lean) view --------------------------
//
// Reuses the ACCEPTED `computeVoting` over the trace's own stored module
// results — a deterministic READ that yields the exact family contributions the
// pipeline already used. It does not introduce new analyzer mathematics and
// never changes the decision.

export interface FamilyLean {
  readonly family: ModuleFamily;
  readonly side: LeanSide;
  readonly player: number;
  readonly banker: number;
}

export function deriveFamilyLeans(
  moduleResults: readonly ModuleAnalysis[],
): readonly FamilyLean[] {
  const voting = computeVoting(moduleResults, DECISION_CONFIG);
  return voting.familyContributions.map((c) => ({
    family: c.family,
    side:
      c.player > c.banker
        ? LeanSide.PLAYER
        : c.banker > c.player
          ? LeanSide.BANKER
          : LeanSide.NONE,
    player: c.player,
    banker: c.banker,
  }));
}

export type ConflictLevel = 'LOW' | 'MODERATE' | 'HIGH';

export function conflictLevel(conflictScore: number): ConflictLevel {
  if (conflictScore >= DECISION_CONFIG.strongOpposition) return 'HIGH';
  if (conflictScore >= DECISION_CONFIG.moderateConflict) return 'MODERATE';
  return 'LOW';
}
