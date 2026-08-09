/**
 * M7.1 Patch 4 — Threshold Lab (DECISION-004 / BALCFG-001) deterministic tests.
 *
 * Covers: threshold-only conversions at 0.54/0.53/0.52, blockers still SKIP at
 * 0.52, confidence-formula invariance, version immutability, per-shoe lock
 * recovery/invariant, payload round-trip, matcher interaction, and the FORWARD
 * Threshold-Lab statistics (separate from Patch-2.1 simulation).
 *
 * Fixtures were selected deterministically (fixed pattern strings) so the exact
 * per-threshold decision is reproducible.
 */
import { computePrediction } from '@/src/domain/session/engine';
import { SessionEnvironment } from '@/src/domain/session/environment';
import { RoundSource } from '@/src/domain/models/enums';
import { Winner } from '@/src/domain/models/outcome';
import { PairState } from '@/src/domain/models/pair';
import type { RoundRecord } from '@/src/domain/models/round';
import {
  BALANCED_CONFIG_VERSION,
  BALANCED_THRESHOLD_PRESETS,
  DECISION_004_VERSION,
  DEFAULT_BALANCED_THRESHOLD,
  balancedDecisionConfig,
  isBalancedThreshold,
  resolveShoeThresholdFromLocks,
  BalancedThresholdInvariantError,
  type BalancedThreshold,
} from '@/src/domain/decision';
import { computeThresholdLabFromDataset } from '@/src/domain/observability';
import { prepareCorpus } from '@/src/domain/matcher';
import type { BappDataset, LockedPredictionEntryRecord } from '@/src/domain/backup';
import { EMPTY_DATASET } from '@/src/domain/backup';

const buildMatcherCorpusStub = () => prepareCorpus([], [], 'lab');

const NOW = '2026-05-01T00:00:00.000Z';

const mk = (s: string): RoundRecord[] =>
  s.split('').map((c, i) => ({
    id: `r${i}`,
    shoeId: 'lab',
    roundNumber: i + 1,
    winner: c === 'P' ? Winner.PLAYER : c === 'B' ? Winner.BANKER : Winner.TIE,
    playerPair: PairState.NO,
    bankerPair: PairState.NO,
    source: RoundSource.HISTORY,
    createdAt: NOW,
  }));

const balanced = (rounds: RoundRecord[], t: BalancedThreshold, profile: 'STRICT' | 'BALANCED' = 'BALANCED') =>
  computePrediction(rounds, SessionEnvironment.LIVE_FORWARD, 'lab', {
    now: NOW,
    profile,
    balancedConfig: balancedDecisionConfig(t),
  });

// Deterministic fixtures (verified):
const FIX_CONVERT_053 = 'PBPBBBPPBPBB'; //  SKIP@0.55/0.54, BET_PLAYER@0.53/0.52 (conf 0.5325)
const FIX_CONVERT_052 = 'BBPPBBPPBBBBBTPP'; // SKIP until 0.52 -> BET_PLAYER (conf 0.5275)
const FIX_CONVERT_054 = 'BBPBPPBPBPBPP'; // SKIP@0.55, BET_BANKER@0.54/0.53/0.52 (conf 0.5479)
const FIX_BLOCKER = 'BPBPBBBBBPBPBPPP'; // SKIP at ALL thresholds, conf 0.54, STRONG_OPPOSITION

// ===========================================================================
// SECTION 18 — DECISION THRESHOLD TESTS
// ===========================================================================
describe('DECISION-004 threshold-only conversions', () => {
  it('0.53 fixture: SKIP at 0.55/0.54, BET at 0.53/0.52 (confidence unchanged)', () => {
    const r = mk(FIX_CONVERT_053);
    expect(balanced(r, 0.55).decision).toBe('SKIP');
    expect(balanced(r, 0.54).decision).toBe('SKIP');
    expect(balanced(r, 0.53).decision).toBe('BET_PLAYER');
    expect(balanced(r, 0.52).decision).toBe('BET_PLAYER');
    // Section 9: only the floor changes — the confidence value is identical.
    const confs = [0.55, 0.54, 0.53, 0.52].map((t) => balanced(r, t as BalancedThreshold).confidence);
    expect(new Set(confs).size).toBe(1);
  });

  it('0.52 fixture: converts only at the 0.52 floor', () => {
    const r = mk(FIX_CONVERT_052);
    expect(balanced(r, 0.55).decision).toBe('SKIP');
    expect(balanced(r, 0.54).decision).toBe('SKIP');
    expect(balanced(r, 0.53).decision).toBe('SKIP');
    expect(balanced(r, 0.52).decision).toBe('BET_PLAYER');
  });

  it('0.54 fixture: SKIP at 0.55, BET at 0.54/0.53/0.52', () => {
    const r = mk(FIX_CONVERT_054);
    expect(balanced(r, 0.55).decision).toBe('SKIP');
    expect(balanced(r, 0.54).decision).toBe('BET_BANKER');
    expect(balanced(r, 0.53).decision).toBe('BET_BANKER');
    expect(balanced(r, 0.52).decision).toBe('BET_BANKER');
  });

  it('blocker: STRONG_OPPOSITION still SKIPs at 0.52 despite confidence >= 0.52', () => {
    const r = mk(FIX_BLOCKER);
    for (const t of [0.55, 0.54, 0.53, 0.52] as const) {
      const p = balanced(r, t);
      expect(p.decision).toBe('SKIP');
    }
    const low = balanced(r, 0.52);
    expect(low.confidence).toBeGreaterThanOrEqual(0.52); // floor would allow BET…
    expect(low.riskFlags).toContain('STRONG_OPPOSITION'); // …but a non-threshold gate blocks it
  });
});

// ===========================================================================
// SECTION 19 — VERSION IMMUTABILITY
// ===========================================================================
describe('DECISION version immutability', () => {
  const r = mk(FIX_CONVERT_053);

  it('STRICT stays DECISION-001 @ 0.55 regardless of Balanced config', () => {
    const p = balanced(r, 0.52, 'STRICT');
    expect(p.profileComparison?.strict.decisionVersion).toBe('DECISION-001');
    // STRICT never bets this near-threshold fixture (its floor is fixed 0.55).
    expect(p.profileComparison?.strict.decision).toBe('SKIP');
    expect(p.decisionConfigVersion).toBe('DECISION-001'); // official = STRICT
  });

  it('BALANCED WITHOUT a Balanced config stays DECISION-003 (backward compatible)', () => {
    const p = computePrediction(r, SessionEnvironment.LIVE_FORWARD, 'lab', {
      now: NOW,
      profile: 'BALANCED',
    });
    expect(p.decisionConfigVersion).toBe('DECISION-003');
    expect(p.balancedConfigVersion).toBeUndefined();
    expect(p.balancedThreshold).toBeUndefined();
  });

  it('BALANCED WITH a Balanced config is DECISION-004 + BALCFG-001', () => {
    const p = balanced(r, 0.53, 'BALANCED');
    expect(p.decisionConfigVersion).toBe(DECISION_004_VERSION);
    expect(p.balancedConfigVersion).toBe(BALANCED_CONFIG_VERSION);
    expect(p.balancedThreshold).toBe(0.53);
    expect(p.profileComparison?.balanced.decisionVersion).toBe(DECISION_004_VERSION);
  });

  it('BALCFG-001 is recoverable even when STRICT is the official profile', () => {
    const p = balanced(r, 0.53, 'STRICT');
    expect(p.decisionConfigVersion).toBe('DECISION-001'); // official
    // shoe-level threshold present on the lock regardless of selection:
    expect(p.balancedConfigVersion).toBe(BALANCED_CONFIG_VERSION);
    expect(p.balancedThreshold).toBe(0.53);
    // and the BALANCED comparison snapshot is DECISION-004:
    expect(p.profileComparison?.balanced.decisionVersion).toBe(DECISION_004_VERSION);
  });

  it('config snapshot round-trips through JSON (DB-002 payload persistence)', () => {
    const p = balanced(r, 0.52, 'STRICT');
    const back = JSON.parse(JSON.stringify(p));
    expect(back.balancedConfigVersion).toBe(BALANCED_CONFIG_VERSION);
    expect(back.balancedThreshold).toBe(0.52);
    expect(back.profileComparison.balanced.decisionVersion).toBe(DECISION_004_VERSION);
  });
});

// ===========================================================================
// SECTION 17 / 5 — PER-SHOE LOCK RECOVERY + INVARIANT
// ===========================================================================
describe('per-shoe threshold recovery from immutable locks', () => {
  it('single BALCFG threshold recovers deterministically', () => {
    expect(
      resolveShoeThresholdFromLocks([
        { balancedConfigVersion: BALANCED_CONFIG_VERSION, balancedThreshold: 0.53 },
        { balancedConfigVersion: BALANCED_CONFIG_VERSION, balancedThreshold: 0.53 },
      ]),
    ).toBe(0.53);
  });

  it('no BALCFG locks => null (fresh or legacy shoe)', () => {
    expect(resolveShoeThresholdFromLocks([])).toBeNull();
    expect(resolveShoeThresholdFromLocks([{ /* legacy pre-Patch-4 */ }])).toBeNull();
  });

  it('contradictory thresholds => invariant error (never picks newest)', () => {
    expect(() =>
      resolveShoeThresholdFromLocks([
        { balancedConfigVersion: BALANCED_CONFIG_VERSION, balancedThreshold: 0.53 },
        { balancedConfigVersion: BALANCED_CONFIG_VERSION, balancedThreshold: 0.52 },
      ]),
    ).toThrow(BalancedThresholdInvariantError);
  });

  it('changing the Next-Shoe threshold cannot mutate an already-computed lock', () => {
    const r = mk(FIX_CONVERT_053);
    const locked053 = balanced(r, 0.53, 'STRICT'); // current shoe locked at 0.53
    const nextShoe052 = balanced(r, 0.52, 'STRICT'); // a NEW shoe would use 0.52
    expect(locked053.balancedThreshold).toBe(0.53); // unchanged
    expect(nextShoe052.balancedThreshold).toBe(0.52);
    // recovery of the current shoe still returns 0.53 from its own lock:
    expect(resolveShoeThresholdFromLocks([locked053])).toBe(0.53);
  });

  it('default Next-Shoe preset is 0.53 and presets are exactly 0.55/0.54/0.53/0.52', () => {
    expect(DEFAULT_BALANCED_THRESHOLD).toBe(0.53);
    expect([...BALANCED_THRESHOLD_PRESETS]).toEqual([0.55, 0.54, 0.53, 0.52]);
    expect(isBalancedThreshold(0.51)).toBe(false);
    expect(isBalancedThreshold(0.56)).toBe(false);
    expect(isBalancedThreshold(0.53)).toBe(true);
  });
});

// ===========================================================================
// SECTION 20 — MATCHER INTERACTION
// ===========================================================================
describe('matcher interaction with threshold changes', () => {
  it('lowering the threshold does not change matcher audit or bypass matcher gating', () => {
    const r = mk(FIX_CONVERT_053);
    const corpus = buildMatcherCorpusStub();
    const p55 = computePrediction(r, SessionEnvironment.LIVE_FORWARD, 'lab', {
      now: NOW,
      profile: 'BALANCED',
      balancedConfig: balancedDecisionConfig(0.55),
      matcherCorpus: corpus,
    });
    const p52 = computePrediction(r, SessionEnvironment.LIVE_FORWARD, 'lab', {
      now: NOW,
      profile: 'BALANCED',
      balancedConfig: balancedDecisionConfig(0.52),
      matcherCorpus: corpus,
    });
    // Matcher audit status is threshold-independent (same corpus => same status).
    expect(p52.matcherAudit?.status).toBe(p55.matcherAudit?.status);
    expect(p52.matcherAudit?.signal).toBe(p55.matcherAudit?.signal);
  });

  it('lowering the threshold does not bypass STRONG_OPPOSITION', () => {
    const r = mk(FIX_BLOCKER);
    const p = computePrediction(r, SessionEnvironment.LIVE_FORWARD, 'lab', {
      now: NOW,
      profile: 'BALANCED',
      balancedConfig: balancedDecisionConfig(0.52),
      matcherCorpus: buildMatcherCorpusStub(),
    });
    expect(p.decision).toBe('SKIP');
  });
});

// ===========================================================================
// SECTION 14 / 15 — FORWARD THRESHOLD-LAB STATISTICS + COVERAGE
// ===========================================================================
const rec = (over: Partial<LockedPredictionEntryRecord>, payload: object): LockedPredictionEntryRecord => ({
  id: over.id ?? 'x',
  shoeId: over.shoeId ?? 's1',
  targetRoundNumber: over.targetRoundNumber ?? 1,
  sequenceIndex: 0,
  status: 'LOCKED',
  decision: over.decision ?? 'SKIP',
  side: over.side ?? null,
  confidence: 0.6,
  category: 'EXPERIMENTAL',
  operatorAction: 'PLAYED',
  evaluation: over.evaluation ?? 'PENDING',
  actualWinner: over.actualWinner ?? null,
  invalidated: over.invalidated ?? false,
  invalidatedByRevisionId: null,
  invalidatedAt: null,
  lockedAt: NOW,
  evaluatedAt: null,
  payloadVersion: 'v1',
  payload: JSON.stringify(payload),
  createdAt: NOW,
});

const p004 = (shoeId: string, threshold: number, balancedDecision: string, official = 'STRICT') => ({
  shoeId,
  balancedConfigVersion: BALANCED_CONFIG_VERSION,
  balancedThreshold: threshold,
  decision: official === 'BALANCED' ? balancedDecision : 'SKIP',
  profileComparison: { selectedProfile: official, balanced: { decision: balancedDecision } },
});

describe('Threshold Lab forward statistics', () => {
  it('empty dataset => not available, four preset buckets', () => {
    const rep = computeThresholdLabFromDataset(EMPTY_DATASET);
    expect(rep.available).toBe(false);
    expect(rep.buckets.map((b) => b.threshold)).toEqual([0.55, 0.54, 0.53, 0.52]);
  });

  it('segments DECISION-004 locks by threshold; legacy DECISION-003 => NOT_AVAILABLE (not bucketed)', () => {
    const ds: BappDataset = {
      ...EMPTY_DATASET,
      lockedPredictions: [
        rec({ id: 'a', shoeId: 's1', decision: 'BET_PLAYER', evaluation: 'WIN', side: 'PLAYER' }, p004('s1', 0.53, 'BET_PLAYER', 'BALANCED')),
        rec({ id: 'b', shoeId: 's1', decision: 'BET_BANKER', evaluation: 'LOSS', side: 'BANKER' }, p004('s1', 0.53, 'BET_BANKER', 'BALANCED')),
        rec({ id: 'c', shoeId: 's2', decision: 'SKIP' }, p004('s2', 0.52, 'SKIP', 'STRICT')),
        // legacy DECISION-003 lock (no BALCFG) — must NOT be bucketed at 0.55
        rec({ id: 'd', shoeId: 's3', decision: 'BET_PLAYER' }, { shoeId: 's3', decisionConfigVersion: 'DECISION-003', profileComparison: { selectedProfile: 'BALANCED', balanced: { decision: 'BET_PLAYER' } } }),
        // invalidated DECISION-004 lock — excluded
        rec({ id: 'e', shoeId: 's1', invalidated: true }, p004('s1', 0.53, 'BET_PLAYER', 'BALANCED')),
      ],
    };
    const rep = computeThresholdLabFromDataset(ds);
    expect(rep.available).toBe(true);
    expect(rep.withBalcfg).toBe(3); // a, b, c
    expect(rep.withoutBalcfg).toBe(1); // legacy d
    const b053 = rep.buckets.find((b) => b.threshold === 0.53)!;
    expect(b053.eligibleDecisions).toBe(2);
    expect(b053.bet).toBe(2);
    expect(b053.playerRecs).toBe(1);
    expect(b053.bankerRecs).toBe(1);
    expect(b053.officialBets).toBe(2); // BALANCED official & played
    expect(b053.win).toBe(1);
    expect(b053.loss).toBe(1);
    expect(b053.winRate.numerator).toBe(1);
    expect(b053.winRate.denominator).toBe(2);
    const b052 = rep.buckets.find((b) => b.threshold === 0.52)!;
    expect(b052.eligibleDecisions).toBe(1);
    expect(b052.bet).toBe(0); // STRICT official + balanced SKIP snapshot
    // legacy lock never appears in the 0.55 bucket
    expect(rep.buckets.find((b) => b.threshold === 0.55)!.eligibleDecisions).toBe(0);
  });
});
