/**
 * M7.1 Patch 3 Stage B1 — production corpus wiring + matcher data foundation.
 *
 * Proves the PRODUCTION path (authoritative BappDataset -> matcherCorpusFromDataset
 * -> computePrediction) with NO test-only corpus injection, the dual-profile
 * pre-result guarantee, matcherAudit persistence, and the pure matcher-audit
 * statistics foundation for Stage B2.
 */
import { computePrediction } from '@/src/domain/session/engine';
import { SessionEnvironment } from '@/src/domain/session/environment';
import { ShoeStatus, RoundSource } from '@/src/domain/models/enums';
import { Winner } from '@/src/domain/models/outcome';
import { PairState } from '@/src/domain/models/pair';
import type { RoundRecord } from '@/src/domain/models/round';
import type { ShoeRecord } from '@/src/domain/models/records';
import type { BappDataset, LockedPredictionEntryRecord } from '@/src/domain/backup';
import { matcherCorpusFromDataset } from '@/src/workflows/matcher/corpus';
import {
  aggregateMatcherAudits,
  computeMatcherStatsFromDataset,
  type StoredMatcherAudit,
} from '@/src/domain/observability';

const NOW = '2026-04-01T00:00:00.000Z';
const BASE = 'PPBPBBPBPPBBPBPBBPPBPBPBBPBPPBPBBPBPBPPBBP'; // 41 non-Tie

const winnerOf = (ch: string): Winner =>
  ch === 'P' ? Winner.PLAYER : ch === 'B' ? Winner.BANKER : Winner.TIE;

function roundsFromString(shoeId: string, s: string): RoundRecord[] {
  return s.split('').map((ch, i) => ({
    id: `${shoeId}-r${i + 1}`,
    shoeId,
    roundNumber: i + 1,
    winner: winnerOf(ch),
    playerPair: PairState.NO,
    bankerPair: PairState.NO,
    source: RoundSource.HISTORY,
    createdAt: NOW,
  }));
}

const shoe = (id: string, status: ShoeStatus = ShoeStatus.ARCHIVED): ShoeRecord => ({
  id,
  label: null,
  environment: SessionEnvironment.HISTORICAL_TEST,
  status,
  roundCount: 0,
  createdAt: NOW,
  updatedAt: NOW,
});

const emptyDataset = (over: Partial<BappDataset>): BappDataset => ({
  shoes: [],
  rounds: [],
  revisions: [],
  lockedPredictions: [],
  sessionStates: [],
  ...over,
});

const currentRounds = roundsFromString('cur', BASE);

/** Dataset with 100 archived shoes whose prefix == BASE then a PLAYER continuation. */
function eligiblePlayerDataset(): BappDataset {
  const shoes = Array.from({ length: 100 }, (_, i) => shoe(`arc${i}`));
  const rounds = shoes.flatMap((s) => roundsFromString(s.id, BASE + 'P' + 'BBBBBBBB')); // 50 non-Tie
  return emptyDataset({ shoes, rounds });
}

// ===========================================================================
// PRODUCTION CORPUS WIRING (no test-only injection)
// ===========================================================================
describe('production corpus wiring', () => {
  it('A) ARCHIVED authoritative data -> production corpus builder', () => {
    const c = matcherCorpusFromDataset(eligiblePlayerDataset(), 'cur')!;
    expect(c.completedShoes).toBe(100);
    expect(c.nonTieRounds).toBeGreaterThanOrEqual(5000);
    expect(c.eligible).toBe(true);
    expect(c.candidates.length).toBeGreaterThan(0);
  });

  it('B) ACTIVE shoe is excluded from the historical source corpus', () => {
    const ds = eligiblePlayerDataset();
    const withActive = emptyDataset({
      shoes: [...ds.shoes, shoe('LIVE', ShoeStatus.ACTIVE)],
      rounds: [...ds.rounds, ...roundsFromString('LIVE', BASE + BASE)],
    });
    const c = matcherCorpusFromDataset(withActive, 'LIVE')!;
    expect(c.completedShoes).toBe(100); // active not counted
    expect(c.candidates.some((cand) => cand.sourceShoeId === 'LIVE')).toBe(false);
  });

  it('C) corpus uses the AUTHORITATIVE (post-revision) round state from the dataset', () => {
    const base = emptyDataset({ shoes: [shoe('a')], rounds: roundsFromString('a', BASE + 'P') });
    // Same shoe, but the authoritative continuation is now BANKER (accepted revision).
    const revised = emptyDataset({ shoes: [shoe('a')], rounds: roundsFromString('a', BASE + 'B') });
    const end = BASE.length; // full-prefix endpoint (prefix === BASE)
    const contP = matcherCorpusFromDataset(base, null)!.candidates.find((c) => c.endpoint === end && c.window === 8);
    const contB = matcherCorpusFromDataset(revised, null)!.candidates.find((c) => c.endpoint === end && c.window === 8);
    expect(contP?.continuation).toBe(Winner.PLAYER);
    expect(contB?.continuation).toBe(Winner.BANKER); // reflects authoritative revision, not stale
  });

  it('D) the production adapter feeds computePrediction with NO test-only injection', () => {
    const corpus = matcherCorpusFromDataset(eligiblePlayerDataset(), 'cur');
    const p = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'cur', {
      now: NOW,
      profile: 'BALANCED',
      matcherCorpus: corpus,
    });
    expect(p.matcherAudit?.signal).toBe('PLAYER');
  });

  it('E) below eligibility -> COLLECTING/ABSTAIN -> BALANCED identical to no directional matcher', () => {
    const small = emptyDataset({
      shoes: [shoe('a'), shoe('b')],
      rounds: [...roundsFromString('a', BASE + 'P'), ...roundsFromString('b', BASE + 'B')],
    });
    const corpus = matcherCorpusFromDataset(small, 'cur');
    expect(corpus!.eligible).toBe(false);
    const withCorpus = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'cur', {
      now: NOW,
      profile: 'BALANCED',
      matcherCorpus: corpus,
    });
    const noCorpus = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'cur', {
      now: NOW,
      profile: 'BALANCED',
    });
    expect(withCorpus.matcherAudit?.signal).toBe('ABSTAIN');
    expect(withCorpus.matcherAudit?.status).toBe('COLLECTING');
    expect(withCorpus.decision).toBe(noCorpus.decision);
    expect(withCorpus.playerScore).toBe(noCorpus.playerScore);
    expect(withCorpus.bankerScore).toBe(noCorpus.bankerScore);
  });

  it('F) eligible corpus + directional matcher -> BALANCED DECISION-003 receives the matcher vote', () => {
    const p = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'cur', {
      now: NOW,
      profile: 'BALANCED',
      matcherCorpus: matcherCorpusFromDataset(eligiblePlayerDataset(), 'cur'),
    });
    expect(p.decisionConfigVersion).toBe('DECISION-003');
    expect(p.matcherAudit?.signal).toBe('PLAYER');
    expect(p.moduleResults.some((m) => m.moduleId === 'historical-matcher' && m.status === 'ACTIVE')).toBe(true);
  });

  it('G) STRICT official is unchanged even when the matcher corpus is eligible', () => {
    const corpus = matcherCorpusFromDataset(eligiblePlayerDataset(), 'cur');
    const strictBaseline = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'cur', {
      now: NOW,
      profile: 'STRICT',
    });
    const strictWithCorpus = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'cur', {
      now: NOW,
      profile: 'STRICT',
      matcherCorpus: corpus,
    });
    expect(strictWithCorpus.decision).toBe(strictBaseline.decision);
    expect(strictWithCorpus.confidence).toBe(strictBaseline.confidence);
    expect(strictWithCorpus.playerScore).toBe(strictBaseline.playerScore);
    expect(strictWithCorpus.moduleResults.some((m) => m.moduleId === 'historical-matcher')).toBe(false);
  });

  it('H) STRICT selected -> BALANCED comparison STILL receives matcher evaluation', () => {
    const p = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'cur', {
      now: NOW,
      profile: 'STRICT',
      matcherCorpus: matcherCorpusFromDataset(eligiblePlayerDataset(), 'cur'),
    });
    expect(p.decisionConfigVersion).toBe('DECISION-001');
    expect(p.matcherAudit?.signal).toBe('PLAYER');
    expect(p.profileComparison?.balanced.decisionVersion).toBe('DECISION-003');
  });

  it('I) switching selection does not change the independently computed snapshots', () => {
    const corpus = matcherCorpusFromDataset(eligiblePlayerDataset(), 'cur');
    const strictSel = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'cur', {
      now: NOW,
      profile: 'STRICT',
      matcherCorpus: corpus,
    });
    const balancedSel = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'cur', {
      now: NOW,
      profile: 'BALANCED',
      matcherCorpus: corpus,
    });
    expect(strictSel.profileComparison?.strict).toEqual(balancedSel.profileComparison?.strict);
    expect(strictSel.profileComparison?.balanced).toEqual(balancedSel.profileComparison?.balanced);
    expect(strictSel.matcherAudit).toEqual(balancedSel.matcherAudit);
  });

  it('J) matcherAudit persists pre-result (immutable / frozen)', () => {
    const p = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'cur', {
      now: NOW,
      profile: 'BALANCED',
      matcherCorpus: matcherCorpusFromDataset(eligiblePlayerDataset(), 'cur'),
    });
    expect(Object.isFrozen(p.matcherAudit)).toBe(true);
    expect(JSON.parse(JSON.stringify(p)).matcherAudit).toEqual(p.matcherAudit);
  });
});

// ===========================================================================
// STATISTICS FOUNDATION
// ===========================================================================
describe('matcher-audit statistics foundation', () => {
  const A = (o: Partial<StoredMatcherAudit>): StoredMatcherAudit => ({ ...o });

  it('zero records => empty coverage with explicit denominator', () => {
    const r = aggregateMatcherAudits([], 0);
    expect(r.totalLocks).toBe(0);
    expect(r.withAudit).toBe(0);
    expect(r.meanEffectiveMatches).toBeNull();
  });

  it('old records without matcherAudit => NOT_AVAILABLE coverage (not dropped)', () => {
    const r = aggregateMatcherAudits([null, null, A({ status: 'COLLECTING', signal: 'ABSTAIN' })], 3);
    expect(r.totalLocks).toBe(3);
    expect(r.withAudit).toBe(1);
    expect(r.withoutAudit).toBe(2);
  });

  it('aggregates COLLECTING / PLAYER / BANKER / ABSTAIN with multiple reasons deterministically', () => {
    const audits: StoredMatcherAudit[] = [
      A({ status: 'COLLECTING', signal: 'ABSTAIN', abstainReason: 'GLOBAL_INELIGIBLE' }),
      A({ status: 'ELIGIBLE', signal: 'PLAYER', effectiveMatches: 20, meanTopSimilarity: 0.9 }),
      A({ status: 'ELIGIBLE', signal: 'BANKER', effectiveMatches: 10, meanTopSimilarity: 0.8 }),
      A({ status: 'ELIGIBLE', signal: 'ABSTAIN', abstainReason: 'TIED_OR_DISPERSED_SUPPORT' }),
      A({ status: 'ELIGIBLE', signal: 'ABSTAIN', abstainReason: 'INSUFFICIENT_SIMILARITY' }),
    ];
    const r = aggregateMatcherAudits(audits);
    const r2 = aggregateMatcherAudits([...audits].reverse());
    expect(r.collecting).toBe(1);
    expect(r.eligibleEvaluations).toBe(4);
    expect(r.playerSignals).toBe(1);
    expect(r.bankerSignals).toBe(1);
    expect(r.abstain).toBe(3);
    expect(r.abstainReasons.GLOBAL_INELIGIBLE).toBe(1);
    expect(r.abstainReasons.TIED_OR_DISPERSED_SUPPORT).toBe(1);
    expect(r.abstainReasons.INSUFFICIENT_SIMILARITY).toBe(1);
    expect(r.meanEffectiveMatches).toBeCloseTo(7.5, 6); // (20+10+0+0)/4 eligible
    // deterministic (order independent)
    expect(r).toEqual(r2);
  });

  it('computeMatcherStatsFromDataset reads immutable matcherAudit from payloads and skips invalidated', () => {
    const lock = (id: string, audit: object | null, invalidated = false): LockedPredictionEntryRecord => ({
      id,
      shoeId: 'cur',
      targetRoundNumber: 1,
      sequenceIndex: 0,
      status: 'RESOLVED',
      decision: 'SKIP',
      side: null,
      confidence: 0.5,
      category: 'BELOW_THRESHOLD',
      operatorAction: 'UNSET',
      evaluation: 'PENDING',
      actualWinner: null,
      invalidated,
      invalidatedByRevisionId: null,
      invalidatedAt: null,
      lockedAt: NOW,
      evaluatedAt: null,
      payloadVersion: 'LP-1',
      payload: JSON.stringify(audit ? { matcherAudit: audit } : {}),
      createdAt: NOW,
    });
    const dataset = emptyDataset({
      lockedPredictions: [
        lock('l1', { status: 'ELIGIBLE', signal: 'PLAYER', effectiveMatches: 12, meanTopSimilarity: 0.85 }),
        lock('l2', { status: 'COLLECTING', signal: 'ABSTAIN', abstainReason: 'GLOBAL_INELIGIBLE' }),
        lock('l3', null), // pre-Patch-3 lock => NOT_AVAILABLE
        lock('l4', { status: 'ELIGIBLE', signal: 'BANKER' }, true), // invalidated => ignored
      ],
    });
    const r = computeMatcherStatsFromDataset(dataset);
    expect(r.totalLocks).toBe(3); // invalidated excluded
    expect(r.withAudit).toBe(2);
    expect(r.withoutAudit).toBe(1);
    expect(r.playerSignals).toBe(1);
    expect(r.collecting).toBe(1);
    expect(r.bankerSignals).toBe(0); // invalidated banker not counted
  });
});

// ===========================================================================
// PERFORMANCE SANITY
// ===========================================================================
describe('Stage B1 performance sanity', () => {
  it('prepares a 100-shoe / 5000+ non-Tie production corpus and queries quickly', () => {
    const t0 = Date.now();
    const corpus = matcherCorpusFromDataset(eligiblePlayerDataset(), 'cur')!;
    const prepMs = Date.now() - t0;
    const t1 = Date.now();
    computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'cur', {
      now: NOW,
      profile: 'BALANCED',
      matcherCorpus: corpus,
    });
    const queryMs = Date.now() - t1;
    expect(corpus.completedShoes).toBe(100);
    expect(corpus.nonTieRounds).toBeGreaterThanOrEqual(5000);
    expect(prepMs).toBeLessThan(10000);
    expect(queryMs).toBeLessThan(1500);
  });
});
