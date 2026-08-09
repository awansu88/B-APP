/**
 * M7.1 Patch 4 — Threshold Lab FORWARD statistics (pure, deterministic).
 *
 * Segments immutable DECISION-004 / BALCFG-001 locks by their per-shoe Balanced
 * threshold. This is FORWARD OBSERVED experiment data — kept strictly separate
 * from the Patch-2.1 retrospective simulation (different denominators). Old
 * DECISION-001/002/003 locks have NO BALCFG-001 and are reported as explicit
 * NOT_AVAILABLE coverage — never reinterpreted or bucketed retroactively.
 */
import type { BappDataset } from '../backup';
import { BALANCED_CONFIG_VERSION, BALANCED_THRESHOLD_PRESETS } from '../decision';
import type { RateFraction } from '../statistics';

const frac = (numerator: number, denominator: number): RateFraction => ({
  numerator,
  denominator,
  percent: denominator > 0 ? (numerator / denominator) * 100 : null,
});

export interface ThresholdBucketStats {
  readonly threshold: number;
  readonly shoes: number;
  readonly eligibleDecisions: number;
  readonly bet: number;
  readonly skip: number;
  readonly betAvailability: RateFraction;
  readonly playerRecs: number;
  readonly bankerRecs: number;
  /** Observed results counted ONLY where BALANCED was the official/played profile. */
  readonly officialBets: number;
  readonly win: number;
  readonly loss: number;
  readonly push: number;
  readonly winRate: RateFraction;
}

export interface ThresholdLabReport {
  readonly available: boolean;
  /** DECISION-004 / BALCFG-001 valid locks (coverage numerator). */
  readonly withBalcfg: number;
  /** Pre-Patch-4 valid locks (no BALCFG-001) — NOT_AVAILABLE. */
  readonly withoutBalcfg: number;
  readonly totalValid: number;
  /** Always the four presets, descending (0.55 → 0.52). */
  readonly buckets: readonly ThresholdBucketStats[];
}

interface ParsedLock {
  readonly shoeId: string;
  readonly threshold: number;
  readonly balancedDecision: string; // BALANCED snapshot recommendation (DECISION-004)
  readonly selectedProfile: string;
  readonly officialDecision: string; // top-level (selected profile) decision
  readonly evaluation: string;
}

function parseLock(payload: string | null, evaluation: string): ParsedLock | null {
  if (!payload) return null;
  try {
    const p = JSON.parse(payload) as {
      shoeId?: string;
      balancedConfigVersion?: string;
      balancedThreshold?: number;
      decision?: string;
      profileComparison?: {
        selectedProfile?: string;
        balanced?: { decision?: string };
      };
    };
    if (p.balancedConfigVersion !== BALANCED_CONFIG_VERSION || typeof p.balancedThreshold !== 'number') {
      return null;
    }
    return {
      shoeId: p.shoeId ?? '',
      threshold: p.balancedThreshold,
      balancedDecision: p.profileComparison?.balanced?.decision ?? 'SKIP',
      selectedProfile: p.profileComparison?.selectedProfile ?? 'STRICT',
      officialDecision: p.decision ?? 'SKIP',
      evaluation,
    };
  } catch {
    return null;
  }
}

function emptyBucket(threshold: number): ThresholdBucketStats {
  return {
    threshold,
    shoes: 0,
    eligibleDecisions: 0,
    bet: 0,
    skip: 0,
    betAvailability: frac(0, 0),
    playerRecs: 0,
    bankerRecs: 0,
    officialBets: 0,
    win: 0,
    loss: 0,
    push: 0,
    winRate: frac(0, 0),
  };
}

export function computeThresholdLabFromDataset(dataset: BappDataset): ThresholdLabReport {
  const valid = dataset.lockedPredictions.filter((r) => !r.invalidated);
  const parsed: ParsedLock[] = [];
  let withoutBalcfg = 0;
  for (const r of valid) {
    const pl = parseLock(r.payload, r.evaluation);
    if (pl) parsed.push(pl);
    else withoutBalcfg += 1;
  }

  const buckets = BALANCED_THRESHOLD_PRESETS.map((threshold) => {
    const inBucket = parsed.filter((p) => p.threshold === threshold);
    if (inBucket.length === 0) return emptyBucket(threshold);
    const shoes = new Set(inBucket.map((p) => p.shoeId)).size;
    let bet = 0;
    let playerRecs = 0;
    let bankerRecs = 0;
    let officialBets = 0;
    let win = 0;
    let loss = 0;
    let push = 0;
    for (const p of inBucket) {
      if (p.balancedDecision === 'BET_PLAYER') {
        bet += 1;
        playerRecs += 1;
      } else if (p.balancedDecision === 'BET_BANKER') {
        bet += 1;
        bankerRecs += 1;
      }
      // Observed results: only where BALANCED was actually official/played.
      if (p.selectedProfile === 'BALANCED' && p.officialDecision !== 'SKIP') {
        if (p.evaluation === 'WIN') {
          officialBets += 1;
          win += 1;
        } else if (p.evaluation === 'LOSS') {
          officialBets += 1;
          loss += 1;
        } else if (p.evaluation === 'PUSH') {
          officialBets += 1;
          push += 1;
        }
      }
    }
    const eligibleDecisions = inBucket.length;
    return {
      threshold,
      shoes,
      eligibleDecisions,
      bet,
      skip: eligibleDecisions - bet,
      betAvailability: frac(bet, eligibleDecisions),
      playerRecs,
      bankerRecs,
      officialBets,
      win,
      loss,
      push,
      winRate: frac(win, win + loss),
    };
  });

  return {
    available: parsed.length > 0,
    withBalcfg: parsed.length,
    withoutBalcfg,
    totalValid: valid.length,
    buckets,
  };
}
