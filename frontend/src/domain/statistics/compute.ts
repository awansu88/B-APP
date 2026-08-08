/**
 * Milestone 6 — PURE deterministic statistics.
 *
 * No React / RN / Expo / SQLite / UI imports. Everything is derived from an
 * in-memory `BappDataset` (a projection of the authoritative records).
 *
 * Sequence (three-win) and fixed-paper behaviour REUSE the accepted Milestone-5
 * primitives verbatim (`advanceSequence`, `applyPaper`) — there is NO second
 * sequence algorithm here. Sequences NEVER cross shoe boundaries: every shoe is
 * folded from a fresh tracker.
 *
 * Denominators are explicit: observed win rate = WIN / (WIN + LOSS); PUSH and
 * SKIPPED are excluded from the WIN/LOSS denominator; INVALIDATED entries are
 * excluded from all valid-performance statistics.
 */
import { PredictionCategory, PredictionDecision } from '../models/enums';
import { Winner } from '../models/outcome';
import {
  ALL_PROFILES,
  PROFILE_CATEGORIES,
  SessionProfile,
  StepResult,
  advanceSequence,
  applyPaper,
  initialSequence,
  type PaperTracking,
  type SequenceState,
} from '../session';
import type { BappDataset, LockedPredictionEntryRecord } from '../backup/dataset';

/** A numerator/denominator pair with an optional percentage (null when N/A). */
export interface RateFraction {
  readonly numerator: number;
  readonly denominator: number;
  readonly percent: number | null;
}

export const winRate = (win: number, loss: number): RateFraction => {
  const denominator = win + loss;
  return {
    numerator: win,
    denominator,
    percent: denominator === 0 ? null : (win / denominator) * 100,
  };
};

export interface OverallStats {
  readonly totalShoes: number;
  readonly totalRounds: number;
  readonly playerCount: number;
  readonly bankerCount: number;
  readonly tieCount: number;
  readonly nonTieCount: number;
}

export interface PredictionStats {
  readonly totalLocked: number;
  readonly valid: number;
  readonly invalidated: number;
  readonly betPlayer: number;
  readonly betBanker: number;
  readonly skip: number;
}

export interface ResultStats {
  readonly win: number;
  readonly loss: number;
  readonly push: number;
  readonly skipped: number;
  readonly winRate: RateFraction;
}

export interface CategoryStat {
  readonly category: PredictionCategory;
  readonly totalBet: number;
  readonly win: number;
  readonly loss: number;
  readonly push: number;
  readonly winRate: RateFraction;
}

export interface SideStat {
  readonly win: number;
  readonly loss: number;
  readonly push: number;
  readonly winRate: RateFraction;
}

export type ProfileCount = Readonly<Record<SessionProfile, number>>;

export interface SequenceReport {
  readonly eligibleAttempts: number;
  readonly win: number;
  readonly loss: number;
  readonly push: number;
  readonly winRate: RateFraction;
  /** Completed three-win sequences per tracking profile. */
  readonly completedByProfile: ProfileCount;
  /** Chain-breaking losses (a LOSS resetting a positive streak) per profile. */
  readonly failedByProfile: ProfileCount;
  /** Fixed-unit paper P/L over this report's eligible attempts (M5 semantics). */
  readonly paper: PaperTracking;
}

export interface RevisionStats {
  readonly totalRevisions: number;
  readonly inserts: number;
  readonly updates: number;
  readonly deletes: number;
  readonly invalidatedPredictions: number;
}

export interface FullStatistics {
  readonly overall: OverallStats;
  readonly predictions: PredictionStats;
  readonly results: ResultStats;
  readonly categories: readonly CategoryStat[];
  readonly betPlayer: SideStat;
  readonly betBanker: SideStat;
  readonly engine: SequenceReport;
  readonly played: SequenceReport;
  readonly revisions: RevisionStats;
}

/** Confidence categories reported by Milestone 6 (recommended tiers only). */
export const REPORTED_CATEGORIES: readonly PredictionCategory[] = Object.freeze([
  PredictionCategory.EXPERIMENTAL,
  PredictionCategory.QUALIFIED,
  PredictionCategory.HIGH_RECOMMENDATION,
]);

const emptyPaper = (): PaperTracking => ({
  unitsStaked: 0,
  netUnits: 0,
  wins: 0,
  losses: 0,
  pushes: 0,
});

const zeroByProfile = (): Record<SessionProfile, number> => ({
  [SessionProfile.EXPERIMENTAL_PLUS]: 0,
  [SessionProfile.QUALIFIED_PLUS]: 0,
  [SessionProfile.HIGH_ONLY]: 0,
});

interface NormEntry {
  readonly shoeId: string;
  readonly sequenceIndex: number;
  readonly decision: PredictionDecision;
  readonly category: PredictionCategory;
  readonly result: StepResult;
  readonly played: boolean;
  readonly invalidated: boolean;
}

const normalize = (e: LockedPredictionEntryRecord): NormEntry => ({
  shoeId: e.shoeId,
  sequenceIndex: e.sequenceIndex,
  decision: e.decision as PredictionDecision,
  category: e.category as PredictionCategory,
  result: e.evaluation as StepResult,
  played: e.operatorAction === 'PLAYED',
  invalidated: e.invalidated,
});

const isBet = (d: PredictionDecision): boolean =>
  d === PredictionDecision.BET_PLAYER || d === PredictionDecision.BET_BANKER;

const isResolvedBet = (r: StepResult): boolean =>
  r === StepResult.WIN || r === StepResult.LOSS || r === StepResult.PUSH;

/** Group normalized valid entries by shoe, ordered by sequenceIndex. */
function groupValidByShoe(entries: readonly NormEntry[]): NormEntry[][] {
  const byShoe = new Map<string, NormEntry[]>();
  for (const e of entries) {
    if (e.invalidated) continue;
    const list = byShoe.get(e.shoeId) ?? [];
    list.push(e);
    byShoe.set(e.shoeId, list);
  }
  const groups: NormEntry[][] = [];
  for (const list of byShoe.values()) {
    groups.push([...list].sort((a, b) => a.sequenceIndex - b.sequenceIndex));
  }
  return groups;
}

/**
 * Fold three-win sequences + fixed paper for one report (engine = all valid
 * recommendations; played = operator-played only). Reuses the accepted M5
 * `advanceSequence` / `applyPaper` primitives; resets per shoe.
 */
function buildSequenceReport(
  groups: readonly NormEntry[][],
  playedOnly: boolean,
): SequenceReport {
  const completed = zeroByProfile();
  const failed = zeroByProfile();
  let paper = emptyPaper();
  let eligibleAttempts = 0;
  let win = 0;
  let loss = 0;
  let push = 0;

  for (const shoe of groups) {
    const state: Record<SessionProfile, SequenceState> = {
      [SessionProfile.EXPERIMENTAL_PLUS]: initialSequence(),
      [SessionProfile.QUALIFIED_PLUS]: initialSequence(),
      [SessionProfile.HIGH_ONLY]: initialSequence(),
    };
    for (const e of shoe) {
      if (playedOnly && !e.played) continue;
      if (isResolvedBet(e.result)) {
        eligibleAttempts += 1;
        if (e.result === StepResult.WIN) win += 1;
        else if (e.result === StepResult.LOSS) loss += 1;
        else push += 1;
        paper = applyPaper(paper, e.result);
      }
      for (const profile of ALL_PROFILES) {
        const prev = state[profile];
        const counts = PROFILE_CATEGORIES[profile].includes(e.category);
        if (counts && e.result === StepResult.LOSS && prev.consecutiveWins > 0) {
          failed[profile] += 1;
        }
        const next = advanceSequence(prev, e.result, e.category, profile);
        if (next.completions > prev.completions) {
          completed[profile] += next.completions - prev.completions;
        }
        state[profile] = next;
      }
    }
  }

  return {
    eligibleAttempts,
    win,
    loss,
    push,
    winRate: winRate(win, loss),
    completedByProfile: completed,
    failedByProfile: failed,
    paper,
  };
}

/** Compute the full Milestone-6 statistics report from a dataset (pure). */
export function computeFullStatistics(dataset: BappDataset): FullStatistics {
  // --- OVERALL (raw rounds) ------------------------------------------------
  let playerCount = 0;
  let bankerCount = 0;
  let tieCount = 0;
  for (const r of dataset.rounds) {
    if (r.winner === Winner.PLAYER) playerCount += 1;
    else if (r.winner === Winner.BANKER) bankerCount += 1;
    else if (r.winner === Winner.TIE) tieCount += 1;
  }
  const overall: OverallStats = {
    totalShoes: dataset.shoes.length,
    totalRounds: dataset.rounds.length,
    playerCount,
    bankerCount,
    tieCount,
    nonTieCount: playerCount + bankerCount,
  };

  const entries = dataset.lockedPredictions.map(normalize);
  const valid = entries.filter((e) => !e.invalidated);

  // --- PREDICTIONS ---------------------------------------------------------
  const predictions: PredictionStats = {
    totalLocked: entries.length,
    valid: valid.length,
    invalidated: entries.length - valid.length,
    betPlayer: valid.filter((e) => e.decision === PredictionDecision.BET_PLAYER).length,
    betBanker: valid.filter((e) => e.decision === PredictionDecision.BET_BANKER).length,
    skip: valid.filter((e) => e.decision === PredictionDecision.SKIP).length,
  };

  // --- RESULTS (valid, resolved) ------------------------------------------
  const rWin = valid.filter((e) => e.result === StepResult.WIN).length;
  const rLoss = valid.filter((e) => e.result === StepResult.LOSS).length;
  const rPush = valid.filter((e) => e.result === StepResult.PUSH).length;
  const rSkipped = valid.filter((e) => e.result === StepResult.SKIPPED).length;
  const results: ResultStats = {
    win: rWin,
    loss: rLoss,
    push: rPush,
    skipped: rSkipped,
    winRate: winRate(rWin, rLoss),
  };

  // --- CONFIDENCE CATEGORIES (valid BET only) ------------------------------
  const categories: CategoryStat[] = REPORTED_CATEGORIES.map((category) => {
    const bucket = valid.filter((e) => e.category === category && isBet(e.decision));
    const w = bucket.filter((e) => e.result === StepResult.WIN).length;
    const l = bucket.filter((e) => e.result === StepResult.LOSS).length;
    const p = bucket.filter((e) => e.result === StepResult.PUSH).length;
    return { category, totalBet: bucket.length, win: w, loss: l, push: p, winRate: winRate(w, l) };
  });

  // --- PLAYER vs BANKER RECOMMENDATION (valid) -----------------------------
  const sideStat = (decision: PredictionDecision): SideStat => {
    const bucket = valid.filter((e) => e.decision === decision);
    const w = bucket.filter((e) => e.result === StepResult.WIN).length;
    const l = bucket.filter((e) => e.result === StepResult.LOSS).length;
    const p = bucket.filter((e) => e.result === StepResult.PUSH).length;
    return { win: w, loss: l, push: p, winRate: winRate(w, l) };
  };

  // --- ENGINE vs PLAYED (per shoe, accepted M5 semantics) ------------------
  const groups = groupValidByShoe(valid);
  const engine = buildSequenceReport(groups, false);
  const played = buildSequenceReport(groups, true);

  // --- REVISIONS / INVALIDATED --------------------------------------------
  const revisions: RevisionStats = {
    totalRevisions: dataset.revisions.length,
    inserts: dataset.revisions.filter((r) => r.action === 'INSERT').length,
    updates: dataset.revisions.filter((r) => r.action === 'UPDATE').length,
    deletes: dataset.revisions.filter((r) => r.action === 'DELETE').length,
    invalidatedPredictions: predictions.invalidated,
  };

  return {
    overall,
    predictions,
    results,
    categories,
    betPlayer: sideStat(PredictionDecision.BET_PLAYER),
    betBanker: sideStat(PredictionDecision.BET_BANKER),
    engine,
    played,
    revisions,
  };
}
