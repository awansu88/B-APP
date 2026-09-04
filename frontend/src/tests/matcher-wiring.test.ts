/**
 * M7.1 Patch 3 Stage B1 — production corpus wiring + matcher data foundation.
 *
 * Proves the PRODUCTION path (immutable BAPP-CORPUS-001 + authoritative user
 * BappDataset -> matcherCorpusFromSources -> prepareCorpus -> computePrediction),
 * plus controlled matcher/decision fixtures, the dual-profile pre-result
 * guarantee, matcherAudit persistence, and the pure matcher-audit statistics
 * foundation for Stage B2.
 */
import { computePrediction } from '@/src/domain/session/engine';
import { SessionEnvironment } from '@/src/domain/session/environment';
import { ShoeStatus, RoundSource } from '@/src/domain/models/enums';
import { Winner } from '@/src/domain/models/outcome';
import { PairState } from '@/src/domain/models/pair';
import type { RoundRecord } from '@/src/domain/models/round';
import type { ShoeRecord } from '@/src/domain/models/records';
import type { BappDataset, LockedPredictionEntryRecord } from '@/src/domain/backup';
import { getBundledCorpusProjection } from '@/src/data/corpus';
import { prepareCorpus, type MatcherCorpus } from '@/src/domain/matcher';
import { matcherCorpusFromSources } from '@/src/workflows/matcher/corpus';
import {
  aggregateMatcherAudits,
  computeMatcherStatsFromDataset,
  type StoredMatcherAudit,
} from '@/src/domain/observability';

const NOW = '2026-04-01T00:00:00.000Z';
const BASE = 'PPBPBBPBPPBBPBPBBPPBPBPBBPBPPBPBBPBPBPPBBP'; // 42 non-Tie

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
  const rounds = shoes.flatMap((s) => roundsFromString(s.id, BASE + 'P' + 'BBBBBBBB')); // 51 non-Tie
  return emptyDataset({ shoes, rounds });
}

// ===========================================================================
// PRODUCTION CORPUS WIRING + CONTROLLED DECISION REGRESSIONS
// ===========================================================================
describe('production corpus wiring', () => {
  const bundled = getBundledCorpusProjection();

  it('A) fresh install is eligible from the bundled corpus alone', () => {
    const c = matcherCorpusFromSources(emptyDataset({}), 'cur');
    expect(bundled.shoes).toHaveLength(1000);
    expect(bundled.rounds).toHaveLength(72900);
    expect(c.completedShoes).toBe(1000);
    expect(c.nonTieRounds).toBe(66086);
    expect(c.eligible).toBe(true);
    expect(c.candidates.length).toBeGreaterThan(0);
    expect(c.candidates.some((candidate) => candidate.sourceShoeId.startsWith('corpus001-'))).toBe(true);
  });

  it.each([null, undefined])('B) missing user dataset (%s) still uses the bundled source', (dataset) => {
    const c = matcherCorpusFromSources(dataset, null);
    expect(c.completedShoes).toBe(1000);
    expect(c.nonTieRounds).toBe(66086);
    expect(c.eligible).toBe(true);
  });

  it('C) user history contributes while the ACTIVE shoe and its candidates are excluded', () => {
    const archived = Array.from({ length: 5 }, (_, i) => shoe(`user-${i}`));
    const archivedRounds = archived.flatMap((record) => roundsFromString(record.id, BASE + 'P'));
    const active = shoe('user-active', ShoeStatus.ACTIVE);
    const dataset = emptyDataset({
      shoes: [...archived, active],
      rounds: [...archivedRounds, ...roundsFromString(active.id, BASE + BASE)],
    });
    const c = matcherCorpusFromSources(dataset, active.id);
    const userNonTies = archivedRounds.filter((round) => round.winner !== Winner.TIE).length;
    expect(c.completedShoes).toBe(1005);
    expect(c.nonTieRounds).toBe(66086 + userNonTies);
    expect(c.candidates.some((candidate) => candidate.sourceShoeId === archived[0].id)).toBe(true);
    expect(c.candidates.some((candidate) => candidate.sourceShoeId === active.id)).toBe(false);
  });

  it('D) bundled IDs remain namespaced and normal user IDs are preserved', () => {
    const userId = 'shoe-ordinary-user-id';
    const c = matcherCorpusFromSources(
      emptyDataset({ shoes: [shoe(userId)], rounds: roundsFromString(userId, BASE + 'P') }),
      null,
    );
    const sourceIds = new Set(c.candidates.map((candidate) => candidate.sourceShoeId));
    expect([...sourceIds].some((id) => id.startsWith('corpus001-'))).toBe(true);
    expect(sourceIds.has(userId)).toBe(true);
    expect(userId.startsWith('corpus001-')).toBe(false);
    expect(bundled.shoes.some((record) => record.id === userId)).toBe(false);
  });

  it('E) uses authoritative post-revision user rounds rather than a stale cache', () => {
    const base = emptyDataset({ shoes: [shoe('a')], rounds: roundsFromString('a', BASE + 'P') });
    const revised = emptyDataset({ shoes: [shoe('a')], rounds: roundsFromString('a', BASE + 'B') });
    const endpoint = BASE.length;
    const userCandidate = (dataset: BappDataset) =>
      matcherCorpusFromSources(dataset, null).candidates.find(
        (candidate) =>
          candidate.sourceShoeId === 'a' && candidate.endpoint === endpoint && candidate.window === 8,
      );
    expect(userCandidate(base)?.continuation).toBe(Winner.PLAYER);
    expect(userCandidate(revised)?.continuation).toBe(Winner.BANKER);
  });

  it('F) fresh-install matcher evaluation reports ELIGIBLE with exact corpus totals', () => {
    const corpus = matcherCorpusFromSources(emptyDataset({}), 'cur');
    const prediction = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'cur', {
      now: NOW,
      profile: 'BALANCED',
      matcherCorpus: corpus,
    });
    expect(prediction.matcherAudit?.status).toBe('ELIGIBLE');
    expect(prediction.matcherAudit?.eligible).toBe(true);
    expect(prediction.matcherAudit?.completedShoes).toBe(1000);
    expect(prediction.matcherAudit?.nonTieRounds).toBe(66086);
    expect(['PLAYER', 'BANKER', 'ABSTAIN']).toContain(prediction.matcherAudit?.signal);
  });

  it('G) STRICT official output is matcher-independent with the real bundled corpus', () => {
    const corpus = matcherCorpusFromSources(undefined, 'cur');
    const baseline = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'cur', {
      now: NOW,
      profile: 'STRICT',
    });
    const withCorpus = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'cur', {
      now: NOW,
      profile: 'STRICT',
      matcherCorpus: corpus,
    });
    expect(withCorpus.decision).toBe(baseline.decision);
    expect(withCorpus.confidence).toBe(baseline.confidence);
    expect(withCorpus.playerScore).toBe(baseline.playerScore);
    expect(withCorpus.bankerScore).toBe(baseline.bankerScore);
    expect(withCorpus.moduleResults.some((m) => m.moduleId === 'historical-matcher' && m.status === 'ACTIVE')).toBe(false);
  });

  it('H) controlled directional matcher still contributes to BALANCED', () => {
    const dataset = eligiblePlayerDataset();
    const corpus = prepareCorpus(dataset.shoes, dataset.rounds, 'cur');
    const prediction = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'cur', {
      now: NOW,
      profile: 'BALANCED',
      matcherCorpus: corpus,
    });
    expect(prediction.matcherAudit?.signal).toBe('PLAYER');
    expect(prediction.moduleResults.some((m) => m.moduleId === 'historical-matcher' && m.status === 'ACTIVE')).toBe(true);
  });

  it('I) a controlled eligible ABSTAIN does not create an ACTIVE matcher vote', () => {
    const corpus: MatcherCorpus = {
      completedShoes: 100,
      nonTieRounds: 5000,
      eligible: true,
      candidates: [],
    };
    const prediction = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'cur', {
      now: NOW,
      profile: 'BALANCED',
      matcherCorpus: corpus,
    });
    expect(prediction.matcherAudit?.signal).toBe('ABSTAIN');
    expect(prediction.moduleResults.some((m) => m.moduleId === 'historical-matcher' && m.status === 'ACTIVE')).toBe(false);
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
describe('BAPP-CORPUS-001 production performance sanity', () => {
  it('prepares the 1000-shoe / 66086 non-Tie production corpus and evaluates it', () => {
    const t0 = Date.now();
    const corpus = matcherCorpusFromSources(undefined, 'cur');
    const prepMs = Date.now() - t0;
    const t1 = Date.now();
    computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'cur', {
      now: NOW,
      profile: 'BALANCED',
      matcherCorpus: corpus,
    });
    const queryMs = Date.now() - t1;
    expect(corpus.completedShoes).toBe(1000);
    expect(corpus.nonTieRounds).toBe(66086);
    expect(corpus.candidates.length).toBeGreaterThan(0);
    // Observational only: production timings are reported by the acceptance run.
    expect(prepMs).toBeGreaterThanOrEqual(0);
    expect(queryMs).toBeGreaterThanOrEqual(0);
  });
});
