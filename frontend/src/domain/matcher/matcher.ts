/**
 * M7.1 Patch 3 — Multi-Road Historical Matcher (HMATCH-002 / MATCHFP-001).
 *
 * PURE + DETERMINISTIC. No ML, no self-learning, no network, no randomness.
 * Reads ONLY the accepted authoritative rounds of ARCHIVED shoes (the current
 * ACTIVE shoe is NEVER a historical source). Produces at most ONE directional
 * module vote per target (PLAYER / BANKER / ABSTAIN) plus an immutable
 * pre-result audit. Voting math (voting.ts/decide/confidence/risk) is UNCHANGED
 * — the matcher only contributes a single ModuleAnalysis in the HISTORICAL
 * family when it genuinely passes every gate.
 */
import { Winner } from '../models/outcome';
import { ModuleStatus, ShoeStatus } from '../models/enums';
import type { RoundRecord } from '../models/round';
import type { ShoeRecord } from '../models/records';
import {
  AnalysisSignal,
  ReasonCode,
  clamp01,
  type ModuleAnalysis,
} from '../analysis/types';

// --- Versions & fixed EXPERIMENTAL constants --------------------------------

export const HISTORICAL_MATCHER_VERSION = 'HMATCH-002';
export const MATCH_FINGERPRINT_VERSION = 'MATCHFP-001';
/** New reliability-prior version (RELPRIOR-001 is left untouched). */
export const RELIABILITY_PRIOR_VERSION_V2 = 'RELPRIOR-002';
/** Conservative Historical Matcher reliability prior (added by RELPRIOR-002). */
export const HISTORICAL_MATCHER_RELIABILITY = 0.3;

/** Global eligibility thresholds (production — never weakened for UI). */
export const REQUIRED_COMPLETED_SHOES = 100;
export const REQUIRED_NONTIE_ROUNDS = 5000;

/** Fixed deterministic non-Tie context depths. */
export const CONTEXT_WINDOWS: readonly number[] = Object.freeze([8, 12, 16]);

/** Fixed EXPERIMENTAL quality constants (not user-adjustable). */
export const TOP_K = 25;
export const MIN_CANDIDATES = 8;
export const MIN_EFFECTIVE_MATCHES = 5;
export const MIN_SIMILARITY = 0.8;
/** Dominant side must hold >= this share of weighted support (else ABSTAIN). */
export const MIN_SIGNAL_SHARE = 0.6;
/** Similarity blend weights: Big Road PRIMARY; derived bundle discounted. */
export const SIM_WEIGHTS = Object.freeze({ raw: 0.35, bigRoad: 0.45, derived: 0.2 });
/** Performance guard: cap candidate endpoints per shoe (most-recent kept). */
export const MAX_CANDIDATE_ENDPOINTS_PER_SHOE = 80;

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

// --- Fingerprint (MATCHFP-001) ---------------------------------------------

export interface MatchFingerprint {
  readonly version: string;
  readonly window: number;
  /** Recent raw/Bead temporal context: last `window` non-Tie sides ('P'|'B'). */
  readonly raw: readonly string[];
  /** Big Road PRIMARY structure: logical column heights (run lengths). */
  readonly columnHeights: readonly number[];
  /** Derived-road bundle (correlated SECONDARY): recent marks 'R'|'B'. */
  readonly bigEye: readonly string[];
  readonly small: readonly string[];
  readonly cockroach: readonly string[];
}

const nonTieSides = (rounds: readonly RoundRecord[]): string[] =>
  [...rounds]
    .sort((a, b) => a.roundNumber - b.roundNumber)
    .filter((r) => r.winner !== Winner.TIE)
    .map((r) => (r.winner === Winner.PLAYER ? 'P' : 'B'));

const runLengths = (sides: readonly string[]): number[] => {
  const heights: number[] = [];
  let prev: string | null = null;
  for (const s of sides) {
    if (s === prev) heights[heights.length - 1] += 1;
    else {
      heights.push(1);
      prev = s;
    }
  }
  return heights;
};

/**
 * MATCHFP-001 only observes the ordered derived-road marks, not their rendered
 * grid positions. This is the same column-comparison walk used by ROADMAP-001,
 * expressed locally so matcher preparation does not allocate complete roadmap
 * boards for every historical endpoint.
 */
const derivedMarkChars = (heights: readonly number[], offset: number): string[] => {
  const marks: string[] = [];
  for (let column = 0; column < heights.length; column += 1) {
    for (let row = 0; row < heights[column]; row += 1) {
      if (row === 0) {
        const compared = column - 1 - offset;
        if (compared >= 0) {
          marks.push(heights[column - 1] === heights[compared] ? 'R' : 'B');
        }
      } else {
        const compared = column - offset;
        if (compared >= 0) marks.push(heights[compared] >= row + 1 ? 'R' : 'B');
      }
    }
  }
  return marks;
};

const fingerprintsForSides = (
  sides: readonly string[],
  windows: readonly number[],
): Map<number, MatchFingerprint> => {
  const map = new Map<number, MatchFingerprint>();
  const minW = Math.min(...windows);
  if (sides.length < minW) return map;
  const columnHeights = runLengths(sides);
  const bigEye = derivedMarkChars(columnHeights, 1);
  const small = derivedMarkChars(columnHeights, 2);
  const cockroach = derivedMarkChars(columnHeights, 3);
  for (const window of windows) {
    if (sides.length < window) continue;
    map.set(window, {
      version: MATCH_FINGERPRINT_VERSION,
      window,
      raw: sides.slice(-window),
      columnHeights,
      bigEye: bigEye.slice(-window),
      small: small.slice(-window),
      cockroach: cockroach.slice(-window),
    });
  }
  return map;
};

/**
 * Build every requested-window fingerprint for a PREFIX in one derived-state
 * projection (computed over EXACTLY the prefix — no future leakage).
 */
export function fingerprintsForPrefix(
  prefixRounds: readonly RoundRecord[],
  windows: readonly number[] = CONTEXT_WINDOWS,
): Map<number, MatchFingerprint> {
  const sides = nonTieSides(prefixRounds);
  return fingerprintsForSides(sides, windows);
}

/**
 * Build a MATCHFP-001 fingerprint over a PREFIX of rounds (pre-target). Returns
 * null when the prefix cannot fill the requested non-Tie window (malformed).
 * The derived roads are computed over EXACTLY the prefix (no future leakage).
 */
export function buildFingerprint(
  prefixRounds: readonly RoundRecord[],
  window: number,
): MatchFingerprint | null {
  return fingerprintsForPrefix(prefixRounds, [window]).get(window) ?? null;
}

// --- Similarity (bounded 0..1, deterministic) -------------------------------

const suffixMatch = (a: readonly string[], b: readonly string[]): number => {
  const l = Math.min(a.length, b.length);
  if (l === 0) return 0;
  let eq = 0;
  const aStart = a.length - l;
  const bStart = b.length - l;
  for (let i = 0; i < l; i += 1) if (a[aStart + i] === b[bStart + i]) eq += 1;
  return eq / l;
};

const roadSim = (a: readonly string[], b: readonly string[]): number => {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  return suffixMatch(a, b);
};

const heightSim = (a: readonly number[], b: readonly number[]): number => {
  const l = Math.min(a.length, b.length, 6);
  if (l === 0) return a.length === 0 && b.length === 0 ? 1 : 0;
  let diff = 0;
  let denom = 0;
  const aStart = a.length - l;
  const bStart = b.length - l;
  for (let i = 0; i < l; i += 1) {
    const ah = a[aStart + i];
    const bh = b[bStart + i];
    diff += Math.abs(ah - bh);
    denom += Math.max(ah, bh);
  }
  return denom === 0 ? 1 : clamp01(1 - diff / denom);
};

/**
 * Deterministic bounded similarity in [0,1].
 *
 *   sim = 0.35*rawSim + 0.45*bigRoadSim + 0.20*derivedBundleSim
 *   derivedBundleSim = mean(bigEyeSim, smallSim, cockroachSim)   // ONE bundled,
 *                                                                // correlation-discounted term (NOT three independent weights)
 *
 * Same input always returns the same score; identical fingerprints => 1.0.
 */
export function similarity(a: MatchFingerprint, b: MatchFingerprint): number {
  if (a.window !== b.window) return 0;
  const rawSim = suffixMatch(a.raw, b.raw);
  const bigRoadSim = heightSim(a.columnHeights, b.columnHeights);
  const derivedBundleSim =
    (roadSim(a.bigEye, b.bigEye) + roadSim(a.small, b.small) + roadSim(a.cockroach, b.cockroach)) / 3;
  return round6(
    clamp01(SIM_WEIGHTS.raw * rawSim + SIM_WEIGHTS.bigRoad * bigRoadSim + SIM_WEIGHTS.derived * derivedBundleSim),
  );
}

// --- Candidates & corpus ----------------------------------------------------

export interface HistoricalCandidate {
  readonly sourceShoeId: string;
  /** Raw round index consumed as the context endpoint (continuation = next raw round). */
  readonly endpoint: number;
  readonly continuation: Winner;
  readonly window: number;
  readonly fingerprint: MatchFingerprint;
  readonly fingerprintVersion: string;
}

/**
 * Extract historical candidate states from ONE archived shoe. Each endpoint e
 * uses prefix rounds[0..e-1]; the continuation is the next raw round's winner
 * (may be TIE => no directional support). Malformed windows are skipped. The
 * most-recent endpoints are kept up to MAX_CANDIDATE_ENDPOINTS_PER_SHOE.
 */
export function buildCandidatesForShoe(rounds: readonly RoundRecord[]): HistoricalCandidate[] {
  const ordered = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber);
  const out: HistoricalCandidate[] = [];
  const startEndpoint = Math.max(1, ordered.length - 1 - MAX_CANDIDATE_ENDPOINTS_PER_SHOE);
  const sides: string[] = [];
  for (let i = 0; i < startEndpoint; i += 1) {
    if (ordered[i].winner !== Winner.TIE) {
      sides.push(ordered[i].winner === Winner.PLAYER ? 'P' : 'B');
    }
  }
  for (let e = startEndpoint; e < ordered.length; e += 1) {
    const continuation = ordered[e].winner;
    const shoeId = ordered[e].shoeId;
    const fps = fingerprintsForSides(sides, CONTEXT_WINDOWS);
    for (const [w, fp] of fps) {
      out.push({
        sourceShoeId: shoeId,
        endpoint: e,
        continuation,
        window: w,
        fingerprint: fp,
        fingerprintVersion: MATCH_FINGERPRINT_VERSION,
      });
    }
    if (continuation !== Winner.TIE) {
      sides.push(continuation === Winner.PLAYER ? 'P' : 'B');
    }
  }
  return out;
}

export interface MatcherCorpus {
  readonly completedShoes: number;
  readonly nonTieRounds: number;
  readonly candidates: readonly HistoricalCandidate[];
  readonly eligible: boolean;
}

const isArchived = (s: ShoeRecord): boolean =>
  s.status === ShoeStatus.ARCHIVED || s.status === ShoeStatus.COMPLETED;

/**
 * Prepare the historical corpus from authoritative shoes + rounds. Only
 * ARCHIVED/COMPLETED shoes are eligible sources; the ACTIVE shoe id is always
 * excluded. Global eligibility requires completedShoes >= 100 AND
 * nonTieRounds >= 5000 (production — never weakened). Intended to be memoized in
 * the workflow layer (not recomputed per render).
 */
export function prepareCorpus(
  shoes: readonly ShoeRecord[],
  rounds: readonly RoundRecord[],
  activeShoeId: string | null,
): MatcherCorpus {
  const sourceShoes = shoes.filter((s) => isArchived(s) && s.id !== activeShoeId);
  const sourceIds = new Set(sourceShoes.map((s) => s.id));
  const byShoe = new Map<string, RoundRecord[]>();
  let nonTieRounds = 0;
  for (const r of rounds) {
    if (!sourceIds.has(r.shoeId)) continue;
    if (r.winner !== Winner.TIE) nonTieRounds += 1;
    const list = byShoe.get(r.shoeId) ?? [];
    list.push(r);
    byShoe.set(r.shoeId, list);
  }
  const candidates: HistoricalCandidate[] = [];
  for (const list of byShoe.values()) {
    candidates.push(...buildCandidatesForShoe(list));
  }
  const completedShoes = sourceShoes.length;
  return {
    completedShoes,
    nonTieRounds,
    candidates,
    eligible: completedShoes >= REQUIRED_COMPLETED_SHOES && nonTieRounds >= REQUIRED_NONTIE_ROUNDS,
  };
}

/** Combine already-prepared sources without rebuilding either source. */
export function combineMatcherCorpora(
  first: MatcherCorpus,
  second: MatcherCorpus,
): MatcherCorpus {
  if (second.completedShoes === 0 && second.nonTieRounds === 0 && second.candidates.length === 0) {
    return first;
  }
  const completedShoes = first.completedShoes + second.completedShoes;
  const nonTieRounds = first.nonTieRounds + second.nonTieRounds;
  return {
    completedShoes,
    nonTieRounds,
    candidates: [...first.candidates, ...second.candidates],
    eligible: completedShoes >= REQUIRED_COMPLETED_SHOES && nonTieRounds >= REQUIRED_NONTIE_ROUNDS,
  };
}

// --- Matcher evaluation -----------------------------------------------------

export type MatcherSignal = 'PLAYER' | 'BANKER' | 'ABSTAIN';
export type MatcherStatus = 'COLLECTING' | 'ELIGIBLE';
export type MatcherAbstainReason =
  | 'GLOBAL_INELIGIBLE'
  | 'INSUFFICIENT_CANDIDATES'
  | 'INSUFFICIENT_EFFECTIVE_MATCHES'
  | 'INSUFFICIENT_SIMILARITY'
  | 'TIED_OR_DISPERSED_SUPPORT'
  | null;

/** Immutable pre-result matcher audit persisted on a Patch-3 LockedPrediction. */
export interface MatcherAudit {
  readonly matcherVersion: string;
  readonly fingerprintVersion: string;
  readonly reliabilityVersion: string;
  readonly status: MatcherStatus;
  readonly eligible: boolean;
  readonly completedShoes: number;
  readonly nonTieRounds: number;
  readonly candidatesConsidered: number;
  readonly effectiveMatches: number;
  readonly topK: number;
  readonly topSimilarity: number;
  readonly meanTopSimilarity: number;
  readonly playerSupport: number;
  readonly bankerSupport: number;
  readonly signal: MatcherSignal;
  readonly strength: number;
  readonly reliability: number;
  readonly abstainReason: MatcherAbstainReason;
}

const abstainAudit = (
  corpus: Pick<MatcherCorpus, 'completedShoes' | 'nonTieRounds' | 'eligible'>,
  candidatesConsidered: number,
  effectiveMatches: number,
  topSimilarity: number,
  meanTopSimilarity: number,
  playerSupport: number,
  bankerSupport: number,
  reason: MatcherAbstainReason,
): MatcherAudit => ({
  matcherVersion: HISTORICAL_MATCHER_VERSION,
  fingerprintVersion: MATCH_FINGERPRINT_VERSION,
  reliabilityVersion: RELIABILITY_PRIOR_VERSION_V2,
  status: corpus.eligible ? 'ELIGIBLE' : 'COLLECTING',
  eligible: corpus.eligible,
  completedShoes: corpus.completedShoes,
  nonTieRounds: corpus.nonTieRounds,
  candidatesConsidered,
  effectiveMatches,
  topK: TOP_K,
  topSimilarity: round6(topSimilarity),
  meanTopSimilarity: round6(meanTopSimilarity),
  playerSupport: round6(playerSupport),
  bankerSupport: round6(bankerSupport),
  signal: 'ABSTAIN',
  strength: 0,
  reliability: HISTORICAL_MATCHER_RELIABILITY,
  abstainReason: reason,
});

/**
 * Evaluate the Historical Matcher for the current target from completed
 * (pre-target) rounds against a prepared corpus. Deterministic. Returns a full
 * audit for EVERY state (COLLECTING / ineligible / gate-ABSTAIN / directional).
 */
export function evaluateMatcher(
  currentRounds: readonly RoundRecord[],
  corpus: MatcherCorpus,
): MatcherAudit {
  if (!corpus.eligible) {
    return abstainAudit(corpus, 0, 0, 0, 0, 0, 0, 'GLOBAL_INELIGIBLE');
  }

  // Score candidates against same-window query fingerprints.
  const queries = fingerprintsForPrefix(currentRounds);

  const topK: { sim: number; continuation: Winner }[] = [];
  let candidatesConsidered = 0;
  const compareScore = (
    a: { sim: number; continuation: Winner },
    b: { sim: number; continuation: Winner },
  ): number => b.sim - a.sim || a.continuation.localeCompare(b.continuation);
  for (const c of corpus.candidates) {
    const q = queries.get(c.window);
    if (!q) continue;
    candidatesConsidered += 1;
    const score = { sim: similarity(q, c.fingerprint), continuation: c.continuation };
    if (topK.length === TOP_K && compareScore(score, topK[topK.length - 1]) >= 0) continue;
    let insertAt = topK.length;
    while (insertAt > 0 && compareScore(score, topK[insertAt - 1]) < 0) insertAt -= 1;
    topK.splice(insertAt, 0, score);
    if (topK.length > TOP_K) topK.pop();
  }
  if (candidatesConsidered < MIN_CANDIDATES) {
    return abstainAudit(corpus, candidatesConsidered, 0, 0, 0, 0, 0, 'INSUFFICIENT_CANDIDATES');
  }

  // Deterministic ordering: similarity desc, then continuation for stable ties.
  const topSimilarity = topK.length > 0 ? topK[0].sim : 0;

  const effective = topK.filter(
    (m) => m.sim >= MIN_SIMILARITY && m.continuation !== Winner.TIE,
  );
  const effectiveMatches = effective.length;
  const meanTopSimilarity =
    effectiveMatches > 0 ? effective.reduce((s, m) => s + m.sim, 0) / effectiveMatches : 0;

  if (topSimilarity < MIN_SIMILARITY) {
    return abstainAudit(corpus, candidatesConsidered, effectiveMatches, topSimilarity, meanTopSimilarity, 0, 0, 'INSUFFICIENT_SIMILARITY');
  }
  if (effectiveMatches < MIN_EFFECTIVE_MATCHES) {
    return abstainAudit(corpus, candidatesConsidered, effectiveMatches, topSimilarity, meanTopSimilarity, 0, 0, 'INSUFFICIENT_EFFECTIVE_MATCHES');
  }

  let playerSupport = 0;
  let bankerSupport = 0;
  for (const m of effective) {
    if (m.continuation === Winner.PLAYER) playerSupport += m.sim;
    else if (m.continuation === Winner.BANKER) bankerSupport += m.sim;
  }
  const total = playerSupport + bankerSupport;
  const maxSupport = Math.max(playerSupport, bankerSupport);
  const signalShare = total > 0 ? maxSupport / total : 0;

  if (total <= 0 || signalShare < MIN_SIGNAL_SHARE) {
    return abstainAudit(corpus, candidatesConsidered, effectiveMatches, topSimilarity, meanTopSimilarity, playerSupport, bankerSupport, 'TIED_OR_DISPERSED_SUPPORT');
  }

  const signal: MatcherSignal = playerSupport > bankerSupport ? 'PLAYER' : 'BANKER';
  // Strength = evidence quality: similarity * directional agreement * sample.
  const agreementFactor = clamp01((signalShare - 0.5) * 2);
  const sampleFactor = clamp01(effectiveMatches / TOP_K);
  const strength = round6(clamp01(meanTopSimilarity * agreementFactor * sampleFactor));

  return {
    matcherVersion: HISTORICAL_MATCHER_VERSION,
    fingerprintVersion: MATCH_FINGERPRINT_VERSION,
    reliabilityVersion: RELIABILITY_PRIOR_VERSION_V2,
    status: 'ELIGIBLE',
    eligible: true,
    completedShoes: corpus.completedShoes,
    nonTieRounds: corpus.nonTieRounds,
    candidatesConsidered,
    effectiveMatches,
    topK: TOP_K,
    topSimilarity: round6(topSimilarity),
    meanTopSimilarity: round6(meanTopSimilarity),
    playerSupport: round6(playerSupport),
    bankerSupport: round6(bankerSupport),
    signal,
    strength,
    reliability: HISTORICAL_MATCHER_RELIABILITY,
    abstainReason: null,
  };
}

/**
 * Convert a matcher audit into a directional ACTIVE ModuleAnalysis for voting
 * injection — ONLY when the matcher produced PLAYER or BANKER. Returns null for
 * ABSTAIN so no ABSTAIN result can ever affect module-count / support gates.
 */
export function matcherModuleAnalysis(audit: MatcherAudit): ModuleAnalysis | null {
  if (audit.signal !== 'PLAYER' && audit.signal !== 'BANKER') return null;
  return {
    moduleId: 'historical-matcher',
    signal: audit.signal === 'PLAYER' ? AnalysisSignal.PLAYER : AnalysisSignal.BANKER,
    strength: audit.strength,
    reliability: audit.reliability,
    status: ModuleStatus.ACTIVE,
    reasonCodes: [ReasonCode.HISTORICAL_MATCH],
    riskFlags: [],
    version: HISTORICAL_MATCHER_VERSION,
  };
}
