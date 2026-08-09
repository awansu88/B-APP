/**
 * M7.1 Patch 3 — Multi-Road Historical Matcher (HMATCH-002 / MATCHFP-001).
 *
 * Deterministic Stage-A tests: global readiness, fingerprint (pre-target only,
 * five roads with the derived bundle correlated), similarity, candidate
 * extraction, quality-gated aggregation (PLAYER/BANKER/ABSTAIN), anti-future
 * leakage, DECISION-003 integration + the ACTIVE-ABSTAIN safety guarantee, and a
 * synthetic performance sanity check.
 */
import {
  buildCandidatesForShoe,
  buildFingerprint,
  CONTEXT_WINDOWS,
  evaluateMatcher,
  fingerprintsForPrefix,
  HISTORICAL_MATCHER_RELIABILITY,
  HISTORICAL_MATCHER_VERSION,
  MATCH_FINGERPRINT_VERSION,
  matcherModuleAnalysis,
  MIN_SIMILARITY,
  prepareCorpus,
  RELIABILITY_PRIOR_VERSION_V2,
  similarity,
  SIM_WEIGHTS,
  TOP_K,
  type HistoricalCandidate,
  type MatcherCorpus,
  type MatchFingerprint,
} from '@/src/domain/matcher';
import { computePrediction } from '@/src/domain/session/engine';
import { SessionEnvironment } from '@/src/domain/session/environment';
import { ShoeStatus, RoundSource } from '@/src/domain/models/enums';
import { Winner } from '@/src/domain/models/outcome';
import { PairState } from '@/src/domain/models/pair';
import type { RoundRecord } from '@/src/domain/models/round';
import type { ShoeRecord } from '@/src/domain/models/records';

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
    createdAt: '2026-01-01T00:00:00.000Z',
  }));
}

const shoe = (id: string, status: ShoeStatus = ShoeStatus.ARCHIVED): ShoeRecord => ({
  id,
  label: null,
  environment: SessionEnvironment.HISTORICAL_TEST,
  status,
  roundCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

// A varied deterministic non-Tie pattern (>= 16 non-Tie so all windows exist).
const BASE = 'PPBPBBPBPPBBPBPBBPPBPBPBBPBPPBPBBPBPBPPBBP';

const currentRounds = roundsFromString('cur', BASE);

/** Directional/tied corpus built from EXACT query fingerprints (sim = 1.0). */
function directCorpus(
  fps: MatchFingerprint[],
  continuations: Winner[],
  copiesPerFp: number,
): MatcherCorpus {
  const candidates: HistoricalCandidate[] = [];
  continuations.forEach((cont, ci) => {
    for (const fp of fps) {
      for (let k = 0; k < copiesPerFp; k += 1) {
        candidates.push({
          sourceShoeId: `src-${cont}-${ci}-${k}`,
          endpoint: 40,
          continuation: cont,
          window: fp.window,
          fingerprint: fp,
          fingerprintVersion: MATCH_FINGERPRINT_VERSION,
        });
      }
    }
  });
  return { completedShoes: 100, nonTieRounds: 5000, eligible: true, candidates };
}

const queryFps = (): MatchFingerprint[] => [...fingerprintsForPrefix(currentRounds).values()];

// ===========================================================================
// GLOBAL READINESS
// ===========================================================================
describe('global eligibility', () => {
  // 100 archived shoes × 50 non-Tie rounds = 5000 non-Tie => ELIGIBLE.
  const fifty = (BASE + BASE).slice(0, 50); // exactly 50 non-Tie chars
  const shoes100 = Array.from({ length: 100 }, (_, i) => shoe(`s${i}`));
  const rounds100 = shoes100.flatMap((s) => roundsFromString(s.id, fifty));

  it('100 shoes + 5000 non-Tie => ELIGIBLE', () => {
    const c = prepareCorpus(shoes100, rounds100, null);
    expect(c.completedShoes).toBe(100);
    expect(c.nonTieRounds).toBe(5000);
    expect(c.eligible).toBe(true);
  });

  it('99 shoes + >=5000 non-Tie => COLLECTING', () => {
    const shoes99 = shoes100.slice(0, 99);
    const rounds99 = shoes99.flatMap((s) => roundsFromString(s.id, fifty));
    const c = prepareCorpus(shoes99, rounds99, null);
    expect(c.completedShoes).toBe(99);
    expect(c.eligible).toBe(false);
  });

  it('100 shoes + 4999 non-Tie => COLLECTING', () => {
    const rounds4999 = rounds100.slice(0, 4999);
    const c = prepareCorpus(shoes100, rounds4999, null);
    expect(c.nonTieRounds).toBe(4999);
    expect(c.eligible).toBe(false);
  });

  it('ACTIVE shoe is NEVER a historical source', () => {
    const withActive = [...shoes100, shoe('LIVE', ShoeStatus.ACTIVE)];
    const activeRounds = roundsFromString('LIVE', fifty.repeat(4)); // large active shoe
    const c = prepareCorpus(withActive, [...rounds100, ...activeRounds], 'LIVE');
    expect(c.completedShoes).toBe(100); // active excluded from source count
    expect(c.nonTieRounds).toBe(5000); // active rounds excluded from corpus
  });

  it('Ties are excluded from the non-Tie corpus count', () => {
    const withTies = shoe('t');
    const rounds = roundsFromString('t', 'PBTPBTPBPB'); // 8 non-Tie, 2 ties
    const c = prepareCorpus([withTies], rounds, null);
    expect(c.nonTieRounds).toBe(8);
  });
});

// ===========================================================================
// FINGERPRINT (MATCHFP-001)
// ===========================================================================
describe('fingerprint MATCHFP-001', () => {
  it('is deterministic (same prefix => identical fingerprint)', () => {
    expect(buildFingerprint(currentRounds, 12)).toEqual(buildFingerprint(currentRounds, 12));
  });

  it('uses ONLY pre-target information (future rounds never change it)', () => {
    const prefix = roundsFromString('x', BASE.slice(0, 20));
    const withFuture = roundsFromString('x', BASE.slice(0, 20) + 'BBBBBB');
    const fpPrefix = buildFingerprint(prefix, 8);
    const fpTrimmedFromFuture = buildFingerprint(withFuture.slice(0, 20), 8);
    expect(fpTrimmedFromFuture).toEqual(fpPrefix);
  });

  it('includes raw temporal context, Big Road structure and the three derived roads', () => {
    const fp = buildFingerprint(currentRounds, 16)!;
    expect(fp.version).toBe(MATCH_FINGERPRINT_VERSION);
    expect(fp.raw).toHaveLength(16); // recent raw/Bead context
    expect(fp.columnHeights.length).toBeGreaterThan(0); // Big Road primary structure
    expect(fp.bigEye.length).toBeGreaterThan(0);
    expect(fp.small.length).toBeGreaterThan(0);
    expect(fp.cockroach.length).toBeGreaterThan(0);
  });

  it('returns null when the non-Tie window cannot be filled', () => {
    expect(buildFingerprint(roundsFromString('s', 'PBP'), 8)).toBeNull();
  });
});

// ===========================================================================
// SIMILARITY
// ===========================================================================
describe('similarity', () => {
  const a = buildFingerprint(currentRounds, 12)!;
  const different = buildFingerprint(roundsFromString('d', 'PBPBPBPBPBPBPBPBPBPBPBPB'), 12)!;

  it('identical fingerprints score exactly 1.0', () => {
    expect(similarity(a, a)).toBe(1);
  });

  it('a clearly different pattern scores strictly lower and stays in [0,1]', () => {
    const s = similarity(a, different);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(1);
  });

  it('is deterministic', () => {
    expect(similarity(a, different)).toBe(similarity(a, different));
  });

  it('different windows never compare (bounded 0)', () => {
    const w8 = buildFingerprint(currentRounds, 8)!;
    expect(similarity(a, w8)).toBe(0);
  });

  it('derived roads are ONE correlation-discounted bundle, not three full weights', () => {
    // Bundle weight (0.20) < Big Road primary weight (0.45); weights sum to 1.
    expect(SIM_WEIGHTS.derived).toBeLessThan(SIM_WEIGHTS.bigRoad);
    expect(SIM_WEIGHTS.raw + SIM_WEIGHTS.bigRoad + SIM_WEIGHTS.derived).toBeCloseTo(1, 6);
    // Flipping ONLY the derived bundle cannot move similarity by more than 0.20.
    const flipped: MatchFingerprint = {
      ...a,
      bigEye: a.bigEye.map((m) => (m === 'R' ? 'B' : 'R')),
      small: a.small.map((m) => (m === 'R' ? 'B' : 'R')),
      cockroach: a.cockroach.map((m) => (m === 'R' ? 'B' : 'R')),
    };
    expect(1 - similarity(a, flipped)).toBeLessThanOrEqual(SIM_WEIGHTS.derived + 1e-6);
  });
});

// ===========================================================================
// CANDIDATES
// ===========================================================================
describe('candidate extraction', () => {
  const rounds = roundsFromString('shoeA', BASE + 'PBPBP'); // 46 non-Tie

  it('one archived shoe produces MANY candidate states (not 1 shoe = 1 pattern)', () => {
    const cands = buildCandidatesForShoe(rounds);
    const uniqueEndpoints = new Set(cands.map((c) => c.endpoint));
    expect(uniqueEndpoints.size).toBeGreaterThan(1);
    expect(cands.length).toBeGreaterThan(CONTEXT_WINDOWS.length);
  });

  it('each candidate carries source shoe, endpoint, continuation, window and fp version', () => {
    const c = buildCandidatesForShoe(rounds)[0];
    expect(c.sourceShoeId).toBe('shoeA');
    expect(typeof c.endpoint).toBe('number');
    expect([Winner.PLAYER, Winner.BANKER, Winner.TIE]).toContain(c.continuation);
    expect(CONTEXT_WINDOWS).toContain(c.window);
    expect(c.fingerprintVersion).toBe(MATCH_FINGERPRINT_VERSION);
  });

  it('the historical continuation is the next raw round after the endpoint', () => {
    const c = buildCandidatesForShoe(rounds).find((x) => x.window === 8 && x.endpoint === 8)!;
    // prefix = first 8 rounds; continuation = 9th round (BASE[8]).
    expect(c.continuation).toBe(winnerOf(BASE[8]));
  });

  it('malformed/incomplete candidates (window unfillable) are excluded', () => {
    const short = buildCandidatesForShoe(roundsFromString('s', 'PBPBPB')); // < 8 non-Tie
    expect(short).toHaveLength(0);
  });
});

// ===========================================================================
// QUALITY GATE / AGGREGATION
// ===========================================================================
describe('quality-gated aggregation', () => {
  const fps = queryFps();

  it('global ineligibility => ABSTAIN with full COLLECTING audit', () => {
    const corpus: MatcherCorpus = { completedShoes: 42, nonTieRounds: 2400, eligible: false, candidates: [] };
    const a = evaluateMatcher(currentRounds, corpus);
    expect(a.signal).toBe('ABSTAIN');
    expect(a.status).toBe('COLLECTING');
    expect(a.abstainReason).toBe('GLOBAL_INELIGIBLE');
    expect(a.reliability).toBe(HISTORICAL_MATCHER_RELIABILITY);
    expect(a.matcherVersion).toBe(HISTORICAL_MATCHER_VERSION);
    expect(a.reliabilityVersion).toBe(RELIABILITY_PRIOR_VERSION_V2);
  });

  it('insufficient candidates => ABSTAIN', () => {
    const a = evaluateMatcher(currentRounds, directCorpus(fps.slice(0, 1), [Winner.PLAYER], 1));
    expect(a.candidatesConsidered).toBeLessThan(8);
    expect(a.abstainReason).toBe('INSUFFICIENT_CANDIDATES');
  });

  it('insufficient similarity => ABSTAIN', () => {
    // Candidates whose fingerprints are a very different pattern (sim < 0.80).
    const diff = fingerprintsForPrefix(roundsFromString('d', 'PBPBPBPBPBPBPBPBPBPBPBPB'));
    const corpus = directCorpus([...diff.values()], [Winner.PLAYER], 10);
    const a = evaluateMatcher(currentRounds, corpus);
    expect(a.topSimilarity).toBeLessThan(MIN_SIMILARITY);
    expect(a.abstainReason).toBe('INSUFFICIENT_SIMILARITY');
  });

  it('insufficient effective matches (TIE continuations) => ABSTAIN', () => {
    const a = evaluateMatcher(currentRounds, directCorpus(fps, [Winner.TIE], 10));
    expect(a.topSimilarity).toBe(1);
    expect(a.effectiveMatches).toBe(0);
    expect(a.abstainReason).toBe('INSUFFICIENT_EFFECTIVE_MATCHES');
  });

  it('tied / dispersed support => ABSTAIN', () => {
    // 3 fps × 2 copies × 2 sides = 12 high-sim matches, evenly split (<= TOP_K).
    const a = evaluateMatcher(currentRounds, directCorpus(fps, [Winner.PLAYER, Winner.BANKER], 2));
    expect(a.effectiveMatches).toBeLessThanOrEqual(TOP_K);
    expect(a.playerSupport).toBeCloseTo(a.bankerSupport, 6);
    expect(a.abstainReason).toBe('TIED_OR_DISPERSED_SUPPORT');
  });

  it('valid PLAYER signal with bounded strength', () => {
    const a = evaluateMatcher(currentRounds, directCorpus(fps, [Winner.PLAYER], 10));
    expect(a.signal).toBe('PLAYER');
    expect(a.abstainReason).toBeNull();
    expect(a.strength).toBeGreaterThan(0);
    expect(a.strength).toBeLessThanOrEqual(1);
    expect(a.effectiveMatches).toBeGreaterThanOrEqual(5);
  });

  it('valid BANKER signal', () => {
    const a = evaluateMatcher(currentRounds, directCorpus(fps, [Winner.BANKER], 10));
    expect(a.signal).toBe('BANKER');
    expect(a.abstainReason).toBeNull();
  });
});

// ===========================================================================
// ANTI-FUTURE-LEAKAGE
// ===========================================================================
describe('anti-future-leakage', () => {
  it('the matcher never receives or uses the target result (only completed rounds)', () => {
    const corpus = directCorpus(queryFps(), [Winner.PLAYER], 10);
    // evaluate depends ONLY on currentRounds (pre-target) + corpus.
    const a1 = evaluateMatcher(currentRounds, corpus);
    const a2 = evaluateMatcher(currentRounds, corpus);
    expect(a1).toEqual(a2);
  });

  it('appending future current-shoe rounds does not change the pre-target fingerprint', () => {
    const fpNow = fingerprintsForPrefix(currentRounds);
    const withFuture = [...currentRounds, ...roundsFromString('cur', 'BPBP')].map((r, i) => ({
      ...r,
      roundNumber: i + 1,
    }));
    const fpTrimmed = fingerprintsForPrefix(withFuture.slice(0, currentRounds.length));
    expect([...fpTrimmed.values()]).toEqual([...fpNow.values()]);
  });

  it('the ACTIVE shoe is excluded even if it structurally matches', () => {
    const c = prepareCorpus([shoe('LIVE', ShoeStatus.ACTIVE)], roundsFromString('LIVE', BASE), 'LIVE');
    expect(c.completedShoes).toBe(0);
    expect(c.candidates).toHaveLength(0);
  });
});

// ===========================================================================
// DECISION-003 INTEGRATION + ACTIVE-ABSTAIN SAFETY
// ===========================================================================
describe('DECISION-003 integration', () => {
  const NOW = '2026-02-01T00:00:00.000Z';
  const abstainCorpus: MatcherCorpus = { completedShoes: 10, nonTieRounds: 500, eligible: false, candidates: [] };

  it('STRICT official is matcher-free (DECISION-001) even when a corpus is supplied', () => {
    const p = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'shoe', {
      now: NOW,
      profile: 'STRICT',
      matcherCorpus: directCorpus(queryFps(), [Winner.PLAYER], 10),
    });
    expect(p.decisionConfigVersion).toBe('DECISION-001');
    // Official STRICT modules never include the matcher.
    expect(p.moduleResults.some((m) => m.moduleId === 'historical-matcher')).toBe(false);
  });

  it('BALANCED stamps DECISION-003 and stores the pre-result matcher audit', () => {
    const p = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'shoe', {
      now: NOW,
      profile: 'BALANCED',
      matcherCorpus: directCorpus(queryFps(), [Winner.PLAYER], 10),
    });
    expect(p.decisionConfigVersion).toBe('DECISION-003');
    expect(p.matcherAudit?.signal).toBe('PLAYER');
    expect(p.moduleResults.some((m) => m.moduleId === 'historical-matcher' && m.status === 'ACTIVE')).toBe(true);
  });

  it('a directional matcher adds HISTORICAL evidence (Player support increases)', () => {
    const withMatcher = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'shoe', {
      now: NOW,
      profile: 'BALANCED',
      matcherCorpus: directCorpus(queryFps(), [Winner.PLAYER], 10),
    });
    const noMatcher = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'shoe', {
      now: NOW,
      profile: 'BALANCED',
    });
    expect(withMatcher.playerScore).toBeGreaterThan(noMatcher.playerScore);
  });

  it('ACTIVE+ABSTAIN matcher NEVER changes the decision (no injected module, identical math)', () => {
    const abstain = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'shoe', {
      now: NOW,
      profile: 'BALANCED',
      matcherCorpus: abstainCorpus,
    });
    const noCorpus = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'shoe', {
      now: NOW,
      profile: 'BALANCED',
    });
    expect(abstain.matcherAudit?.signal).toBe('ABSTAIN');
    expect(abstain.moduleResults.some((m) => m.moduleId === 'historical-matcher')).toBe(false);
    expect(abstain.decision).toBe(noCorpus.decision);
    expect(abstain.playerScore).toBe(noCorpus.playerScore);
    expect(abstain.bankerScore).toBe(noCorpus.bankerScore);
    expect(abstain.confidence).toBe(noCorpus.confidence);
  });

  it('an ABSTAIN result produces no injectable module (matcherModuleAnalysis => null)', () => {
    const a = evaluateMatcher(currentRounds, abstainCorpus);
    expect(matcherModuleAnalysis(a)).toBeNull();
  });

  it('matcher audit round-trips through JSON (immutable persistence)', () => {
    const p = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'shoe', {
      now: NOW,
      profile: 'BALANCED',
      matcherCorpus: directCorpus(queryFps(), [Winner.BANKER], 10),
    });
    const restored = JSON.parse(JSON.stringify(p)).matcherAudit;
    expect(restored).toEqual(p.matcherAudit);
    expect(restored.matcherVersion).toBe(HISTORICAL_MATCHER_VERSION);
  });
});

// ===========================================================================
// STAGE A.1 — DUAL-PROFILE PRE-RESULT COMPARISON TELEMETRY
// (BALANCED snapshot is matcher-evaluated regardless of which profile is
//  selected; the comparison matcher never touches official STRICT / ledger.)
// ===========================================================================
describe('Stage A.1 dual-profile pre-result comparison', () => {
  const NOW = '2026-03-01T00:00:00.000Z';
  const playerCorpus = (): MatcherCorpus => directCorpus(queryFps(), [Winner.PLAYER], 10);
  const abstainCorpus: MatcherCorpus = { completedShoes: 10, nonTieRounds: 500, eligible: false, candidates: [] };

  // Accepted DECISION-001 baseline (no matcher, no corpus, STRICT).
  const strictBaseline = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'shoe', {
    now: NOW,
    profile: 'STRICT',
  });

  it('1) STRICT selected + eligible matcher PLAYER: official STRICT == accepted DECISION-001; BALANCED comparison is DECISION-003 WITH matcher', () => {
    const p = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'shoe', {
      now: NOW,
      profile: 'STRICT',
      matcherCorpus: playerCorpus(),
    });
    // Official STRICT is byte-identical to the accepted DECISION-001 baseline.
    expect(p.decision).toBe(strictBaseline.decision);
    expect(p.confidence).toBe(strictBaseline.confidence);
    expect(p.playerScore).toBe(strictBaseline.playerScore);
    expect(p.bankerScore).toBe(strictBaseline.bankerScore);
    expect(p.decisionConfigVersion).toBe('DECISION-001');
    // STRICT comparison snapshot = DECISION-001, matcher NO VOTE.
    expect(p.profileComparison?.strict.decisionVersion).toBe('DECISION-001');
    // BALANCED comparison snapshot = DECISION-003 and reflects the matcher.
    expect(p.profileComparison?.balanced.decisionVersion).toBe('DECISION-003');
    expect(p.matcherAudit?.signal).toBe('PLAYER');
    // The BALANCED comparison Player evidence exceeds the matcher-free BALANCED.
    const noMatcher = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'shoe', {
      now: NOW,
      profile: 'BALANCED',
    });
    expect(p.profileComparison!.balanced.playerScore).toBeGreaterThan(noMatcher.playerScore);
  });

  it('2) STRICT selected + matcher ABSTAIN: official STRICT unchanged; BALANCED comparison DECISION-003; counts unaffected', () => {
    const p = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'shoe', {
      now: NOW,
      profile: 'STRICT',
      matcherCorpus: abstainCorpus,
    });
    expect(p.decision).toBe(strictBaseline.decision);
    expect(p.playerScore).toBe(strictBaseline.playerScore);
    expect(p.bankerScore).toBe(strictBaseline.bankerScore);
    expect(p.matcherAudit?.signal).toBe('ABSTAIN');
    expect(p.profileComparison?.balanced.decisionVersion).toBe('DECISION-003');
    // ABSTAIN cannot change the BALANCED comparison support vs matcher-free BALANCED.
    const balancedNoMatcher = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'shoe', {
      now: NOW,
      profile: 'BALANCED',
    });
    expect(p.profileComparison!.balanced.playerScore).toBe(balancedNoMatcher.playerScore);
    expect(p.profileComparison!.balanced.bankerScore).toBe(balancedNoMatcher.bankerScore);
  });

  it('3) BALANCED selected: official DECISION-003 (Stage-A behavior); STRICT comparison stays DECISION-001', () => {
    const p = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'shoe', {
      now: NOW,
      profile: 'BALANCED',
      matcherCorpus: playerCorpus(),
    });
    expect(p.decisionConfigVersion).toBe('DECISION-003');
    expect(p.matcherAudit?.signal).toBe('PLAYER');
    expect(p.moduleResults.some((m) => m.moduleId === 'historical-matcher' && m.status === 'ACTIVE')).toBe(true);
    expect(p.profileComparison?.strict.decisionVersion).toBe('DECISION-001');
    expect(p.profileComparison?.strict.playerScore).toBe(strictBaseline.playerScore);
  });

  it('4) Same pre-target state + corpus: switching selection changes ONLY which snapshot is official, not snapshot contents', () => {
    const strictSel = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'shoe', {
      now: NOW,
      profile: 'STRICT',
      matcherCorpus: playerCorpus(),
    });
    const balancedSel = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'shoe', {
      now: NOW,
      profile: 'BALANCED',
      matcherCorpus: playerCorpus(),
    });
    // The independently computed STRICT and BALANCED snapshots are identical
    // across selections (selection changes only which one is official).
    expect(strictSel.profileComparison?.strict).toEqual(balancedSel.profileComparison?.strict);
    expect(strictSel.profileComparison?.balanced).toEqual(balancedSel.profileComparison?.balanced);
    expect(strictSel.matcherAudit).toEqual(balancedSel.matcherAudit);
    // Official pointer differs.
    expect(strictSel.decisionConfigVersion).toBe('DECISION-001');
    expect(balancedSel.decisionConfigVersion).toBe('DECISION-003');
  });

  it('5) comparison matcher telemetry has ZERO session/ledger side effects (official STRICT fields drive Played/operator/ledger)', () => {
    const withMatcher = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'shoe', {
      now: NOW,
      profile: 'STRICT',
      matcherCorpus: playerCorpus(),
    });
    // Every field that feeds Played Sequence / operator action / fixed-paper
    // ledger / session progression comes from the OFFICIAL top-level decision,
    // which equals the matcher-free STRICT baseline.
    expect(withMatcher.decision).toBe(strictBaseline.decision);
    expect(withMatcher.side).toBe(strictBaseline.side);
    expect(withMatcher.category).toBe(strictBaseline.category);
    expect(withMatcher.confidence).toBe(strictBaseline.confidence);
    expect(withMatcher.riskLevel).toBe(strictBaseline.riskLevel);
    expect(withMatcher.moduleResults.some((m) => m.moduleId === 'historical-matcher')).toBe(false);
  });

  it('6) matcher audit is immutable and pre-result (deep-frozen, JSON round-trips)', () => {
    const p = computePrediction(currentRounds, SessionEnvironment.LIVE_FORWARD, 'shoe', {
      now: NOW,
      profile: 'STRICT',
      matcherCorpus: playerCorpus(),
    });
    expect(Object.isFrozen(p.matcherAudit)).toBe(true);
    expect(JSON.parse(JSON.stringify(p)).matcherAudit).toEqual(p.matcherAudit);
  });
});

describe('performance sanity', () => {
  it('prepares a 100-shoe / 5000+ non-Tie corpus and answers a query quickly', () => {
    const patt = (i: number): string => (BASE + BASE).slice(0, 50 + (i % 5)); // >= 50 non-Tie each
    const shoes = Array.from({ length: 100 }, (_, i) => shoe(`perf${i}`));
    const rounds = shoes.flatMap((s, i) => roundsFromString(s.id, patt(i)));

    const t0 = Date.now();
    const corpus = prepareCorpus(shoes, rounds, null);
    const prepMs = Date.now() - t0;

    const t1 = Date.now();
    evaluateMatcher(currentRounds, corpus);
    const queryMs = Date.now() - t1;

    expect(corpus.completedShoes).toBe(100);
    expect(corpus.nonTieRounds).toBeGreaterThanOrEqual(5000);
    expect(prepMs).toBeLessThan(10000);
    expect(queryMs).toBeLessThan(1000);
  });
});
