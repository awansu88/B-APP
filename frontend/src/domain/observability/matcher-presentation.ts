/**
 * M7.1 Patch 3 Stage B2 — Historical Matcher PRESENTATION view-models.
 *
 * PURE + DETERMINISTIC. These builders map already-computed authoritative domain
 * state (MatcherReadiness / immutable MatcherAudit / MatcherStatsReport) into
 * presentation-ready strings for the Settings, Live and Statistics screens.
 *
 * They NEVER recompute matcher mathematics, never re-run HMATCH-002, and never
 * change any threshold. Stage B2 presents existing state only. Similarity /
 * strength / evidence are decision-quality scores — NEVER win probabilities.
 */
import {
  REQUIRED_COMPLETED_SHOES,
  REQUIRED_NONTIE_ROUNDS,
  type MatcherAbstainReason,
  type MatcherAudit,
} from '../matcher';
import type { EngineProfileId } from '../decision';
import type { MatcherReadiness } from './decision-observability';
import type { MatcherStatsReport } from './matcher-observability';

const n = (x: number): string => x.toLocaleString('en-US');
const two = (x: number): string => x.toFixed(2);

// ---------------------------------------------------------------------------
// Abstain reasons — actual HMATCH-002 reasons only (no invented reasons).
// ---------------------------------------------------------------------------
export const MATCHER_ABSTAIN_LABEL: Readonly<Record<NonNullable<MatcherAbstainReason>, string>> = {
  GLOBAL_INELIGIBLE: 'Collecting — not globally eligible',
  INSUFFICIENT_CANDIDATES: 'Insufficient candidates',
  INSUFFICIENT_SIMILARITY: 'Insufficient similarity',
  INSUFFICIENT_EFFECTIVE_MATCHES: 'Insufficient effective matches',
  TIED_OR_DISPERSED_SUPPORT: 'Dispersed / tied support',
};

export function matcherAbstainLabel(reason: MatcherAbstainReason): string {
  return reason ? MATCHER_ABSTAIN_LABEL[reason] : '\u2014';
}

// ---------------------------------------------------------------------------
// SETTINGS — Historical Matcher status.
// ---------------------------------------------------------------------------
export type MatcherProductionVoting = 'WAITING FOR ELIGIBILITY' | 'ACTIVE — QUALITY GATED';

export interface MatcherSettingsView {
  readonly collection: 'ACTIVE';
  readonly completedShoesLabel: string; // "N / 100"
  readonly nonTieRoundsLabel: string; // "N / 5,000"
  readonly eligibility: 'COLLECTING' | 'ELIGIBLE';
  readonly eligible: boolean;
  readonly productionVoting: MatcherProductionVoting;
}

export function buildMatcherSettingsView(r: MatcherReadiness): MatcherSettingsView {
  const eligible = r.eligibility === 'ELIGIBLE';
  return {
    collection: 'ACTIVE',
    completedShoesLabel: `${n(r.completedShoes)} / ${n(r.requiredShoes)}`,
    nonTieRoundsLabel: `${n(r.nonTieRounds)} / ${n(r.requiredNonTieRounds)}`,
    eligibility: r.eligibility,
    eligible,
    productionVoting: eligible ? 'ACTIVE — QUALITY GATED' : 'WAITING FOR ELIGIBILITY',
  };
}

// ---------------------------------------------------------------------------
// LIVE — per-round matcher status from the immutable pre-result MatcherAudit.
// ---------------------------------------------------------------------------
export type MatcherLiveState = 'NOT_AVAILABLE' | 'COLLECTING' | 'ELIGIBLE_ABSTAIN' | 'ACTIVE';

export interface MatcherDetailRow {
  readonly label: string;
  readonly value: string;
}

export interface MatcherLiveView {
  readonly available: boolean;
  readonly state: MatcherLiveState;
  readonly title: 'Historical Matcher';
  /** User-facing state header, e.g. 'ELIGIBLE — ABSTAIN'. */
  readonly stateLabel: string;
  /** Directional signal — ONLY set when state === 'ACTIVE'. */
  readonly signal: 'PLAYER' | 'BANKER' | null;
  /** Collection progress (COLLECTING only). */
  readonly shoesLabel: string | null;
  readonly roundsLabel: string | null;
  readonly votingLabel: string | null;
  /** Concise abstain reason (ELIGIBLE_ABSTAIN only). */
  readonly abstainReasonLabel: string | null;
  /** Evidence (strength) score, e.g. '0.72' — NEVER a probability (ACTIVE only). */
  readonly evidenceLabel: string | null;
  readonly effectiveMatches: number | null;
  /** Expandable technical fields (restrained by default on Live). */
  readonly details: readonly MatcherDetailRow[];
  /**
   * How the matcher relates to the OFFICIAL recommendation for the selected
   * engine mode: STRICT => comparison/control (non-actionable); BALANCED =>
   * supporting evidence. The matcher signal is NEVER a standalone bet.
   */
  readonly contextLabel: string | null;
  readonly isActionableSignal: false;
}

const eligibleDetails = (a: MatcherAudit): MatcherDetailRow[] => [
  { label: 'Candidates', value: n(a.candidatesConsidered) },
  { label: 'Effective Matches', value: n(a.effectiveMatches) },
  { label: 'Top Similarity', value: two(a.topSimilarity) },
  { label: 'Mean Similarity', value: two(a.meanTopSimilarity) },
  { label: 'Strength', value: two(a.strength) },
];

const NOT_AVAILABLE: MatcherLiveView = {
  available: false,
  state: 'NOT_AVAILABLE',
  title: 'Historical Matcher',
  stateLabel: 'NOT AVAILABLE',
  signal: null,
  shoesLabel: null,
  roundsLabel: null,
  votingLabel: null,
  abstainReasonLabel: null,
  evidenceLabel: null,
  effectiveMatches: null,
  details: [],
  contextLabel: null,
  isActionableSignal: false,
};

export function buildMatcherLiveView(
  audit: MatcherAudit | undefined | null,
  engineMode: EngineProfileId,
): MatcherLiveView {
  if (!audit) return NOT_AVAILABLE;

  // The matcher belongs to the BALANCED / DECISION-003 profile. Under STRICT it
  // is only ever comparison/control telemetry (never actionable).
  const strictContext = 'COMPARISON / CONTROL · NON-ACTIONABLE';

  if (audit.status !== 'ELIGIBLE') {
    return {
      ...NOT_AVAILABLE,
      available: true,
      state: 'COLLECTING',
      stateLabel: 'COLLECTING',
      shoesLabel: `${n(audit.completedShoes)} / ${n(REQUIRED_COMPLETED_SHOES)}`,
      roundsLabel: `${n(audit.nonTieRounds)} / ${n(REQUIRED_NONTIE_ROUNDS)}`,
      votingLabel: 'WAITING FOR ELIGIBILITY',
      contextLabel: engineMode === 'STRICT' ? strictContext : null,
    };
  }

  if (audit.signal !== 'PLAYER' && audit.signal !== 'BANKER') {
    return {
      ...NOT_AVAILABLE,
      available: true,
      state: 'ELIGIBLE_ABSTAIN',
      stateLabel: 'ELIGIBLE — ABSTAIN',
      abstainReasonLabel: matcherAbstainLabel(audit.abstainReason),
      effectiveMatches: audit.effectiveMatches,
      details: eligibleDetails(audit),
      contextLabel: engineMode === 'STRICT' ? strictContext : null,
    };
  }

  return {
    ...NOT_AVAILABLE,
    available: true,
    state: 'ACTIVE',
    stateLabel: 'ACTIVE',
    signal: audit.signal,
    evidenceLabel: two(audit.strength),
    effectiveMatches: audit.effectiveMatches,
    details: eligibleDetails(audit),
    contextLabel:
      engineMode === 'STRICT'
        ? strictContext
        : 'Supporting evidence — official recommendation is the Decision Pipeline result',
  };
}

// ---------------------------------------------------------------------------
// STATISTICS — matcher-audit coverage label helpers (on top of Stage-B1 report).
// ---------------------------------------------------------------------------
export function matcherCoverageLabel(report: MatcherStatsReport): string {
  return `${n(report.withAudit)} / ${n(report.totalLocks)} predictions`;
}

/** Deterministic descending abstain-reason distribution for display. */
export function matcherAbstainDistribution(
  report: MatcherStatsReport,
): readonly { readonly reason: string; readonly label: string; readonly count: number }[] {
  return Object.entries(report.abstainReasons)
    .map(([reason, count]) => ({
      reason,
      label:
        reason in MATCHER_ABSTAIN_LABEL
          ? MATCHER_ABSTAIN_LABEL[reason as NonNullable<MatcherAbstainReason>]
          : reason,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}
