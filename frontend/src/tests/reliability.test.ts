/**
 * Milestone 3 — Reliability-semantics regression tests.
 *
 * Locks the corrected meaning of analyzer `reliability`:
 *   reliability = a deterministic, versioned, UNCALIBRATED MVP PRIOR trust
 *                 assigned to the analyzer *itself*.
 *
 * `reliability` MUST NOT encode any current-shoe condition (non-Tie count,
 * stabilityScore, volatilityScore, streak, regime, distribution, shoe position,
 * results, sequence state). Current-shoe evidence lives in `strength`; the
 * Historical Matcher stays DISABLED and Volatility / Derived Road stay
 * SHADOW_ONLY.
 */
import { ModuleStatus, RoundSource } from '@/src/domain/models/enums';
import { Winner } from '@/src/domain/models/outcome';
import { PairState } from '@/src/domain/models/pair';
import type { RoundRecord } from '@/src/domain/models/round';
import { buildShoeStateSnapshot } from '@/src/domain/snapshot';
import { extractFeatures } from '@/src/domain/features';
import {
  RELIABILITY_PRIORS,
  RELIABILITY_PRIOR_VERSION,
  AnalysisSignal,
  chopAnalyzer,
  dataQualityGuard,
  derivedRoadAnalyzer,
  distributionAnalyzer,
  historicalMatcher,
  reliabilityPrior,
  regimeTransitionAnalyzer,
  runAnalysis,
  runLengthAnalyzer,
  streakAnalyzer,
  volatilityAnalyzer,
} from '@/src/domain/analysis';

const SHOE = 'shoe-reliability';

function makeRound(n: number, winner: Winner): RoundRecord {
  return {
    id: `${SHOE}-r${n}`,
    shoeId: SHOE,
    roundNumber: n,
    winner,
    playerPair: PairState.UNKNOWN,
    bankerPair: PairState.UNKNOWN,
    source: RoundSource.HISTORY,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function shoe(winners: readonly Winner[]): RoundRecord[] {
  return winners.map((w, i) => makeRound(i + 1, w));
}

const ctxFor = (rounds: readonly RoundRecord[]) => ({
  snapshot: buildShoeStateSnapshot(rounds),
  features: extractFeatures(rounds),
});

const P = Winner.PLAYER;
const B = Winner.BANKER;

// Two shoes, both >= 8-non-Tie warm-up and both ending in a >=3 Banker streak
// (so the Streak Analyzer produces a directional result in each), but with
// clearly different non-Tie counts, stability, and volatility.
const STABLE_8 = shoe([B, B, B, B, B, B, B, B]); // 8 non-Tie, very stable streak
const VOLATILE_MIX = shoe([P, B, P, B, P, B, B, B]); // 8 non-Tie, choppy then streak
const STABLE_12 = shoe([B, B, B, B, B, B, B, B, B, B, B, B]); // 12 non-Tie
const SHORT_STREAK = shoe([P, B, P, B, P, B, B, B]); // streak 3 -> low strength
const LONG_STREAK = shoe([B, B, B, B, B, B, B, B]); // streak 8 -> high strength

// ---------------------------------------------------------------------------
describe('reliability — versioned uncalibrated prior', () => {
  it('exposes a versioned prior registry', () => {
    expect(RELIABILITY_PRIOR_VERSION).toBe('RELPRIOR-001');
    expect(RELIABILITY_PRIORS.streak).toBe(0.5);
    expect(RELIABILITY_PRIORS.distribution).toBe(0.4);
    expect(RELIABILITY_PRIORS.volatility).toBe(0.3);
    expect(RELIABILITY_PRIORS['historical-matcher']).toBe(0);
  });

  it('every non-ABSTAIN result reports exactly its module prior (no shoe coupling)', () => {
    const report = runAnalysis(ctxFor(STABLE_8));
    for (const r of report.results) {
      if (r.signal === AnalysisSignal.ABSTAIN) {
        expect(r.reliability).toBe(0);
      } else {
        expect(r.reliability).toBe(reliabilityPrior(r.moduleId));
      }
    }
  });
});

// ---------------------------------------------------------------------------
describe('reliability — decoupled from current-shoe conditions', () => {
  it('does NOT change when the non-Tie count changes (once activated)', () => {
    const a = streakAnalyzer.analyze(ctxFor(STABLE_8));
    const b = streakAnalyzer.analyze(ctxFor(STABLE_12));
    // Preconditions: both activated & directional, but different sample sizes.
    expect(a.signal).toBe(AnalysisSignal.BANKER);
    expect(b.signal).toBe(AnalysisSignal.BANKER);
    expect(extractFeatures(STABLE_8).nonTieCount).toBe(8);
    expect(extractFeatures(STABLE_12).nonTieCount).toBe(12);
    // Reliability is unchanged (it is the module prior).
    expect(a.reliability).toBe(RELIABILITY_PRIORS.streak);
    expect(b.reliability).toBe(RELIABILITY_PRIORS.streak);
    expect(a.reliability).toBe(b.reliability);
  });

  it('does NOT change when stabilityScore changes', () => {
    const fStable = extractFeatures(STABLE_8);
    const fVolatile = extractFeatures(VOLATILE_MIX);
    // Precondition: stability really does differ between the two shoes.
    expect(fStable.volatility.stabilityScore).not.toBe(
      fVolatile.volatility.stabilityScore,
    );
    const a = streakAnalyzer.analyze(ctxFor(STABLE_8));
    const b = streakAnalyzer.analyze(ctxFor(VOLATILE_MIX));
    expect(a.signal).toBe(AnalysisSignal.BANKER);
    expect(b.signal).toBe(AnalysisSignal.BANKER);
    expect(a.reliability).toBe(b.reliability);
    expect(a.reliability).toBe(RELIABILITY_PRIORS.streak);
  });

  it('does NOT change when volatilityScore changes', () => {
    const fStable = extractFeatures(STABLE_8);
    const fVolatile = extractFeatures(VOLATILE_MIX);
    expect(fStable.volatility.volatilityScore).not.toBe(
      fVolatile.volatility.volatilityScore,
    );
    // Volatility Analyzer (SHADOW_ONLY) reliability is a fixed prior, NOT the
    // current stabilityScore it used to report.
    const va = volatilityAnalyzer.analyze(ctxFor(STABLE_8));
    const vb = volatilityAnalyzer.analyze(ctxFor(VOLATILE_MIX));
    expect(va.reliability).toBe(RELIABILITY_PRIORS.volatility);
    expect(vb.reliability).toBe(RELIABILITY_PRIORS.volatility);
    expect(va.reliability).not.toBe(fStable.volatility.stabilityScore);
  });
});

// ---------------------------------------------------------------------------
describe('reliability — strength still responds to current features', () => {
  it('strength differs with the current streak while reliability stays fixed', () => {
    const short = streakAnalyzer.analyze(ctxFor(SHORT_STREAK)); // streak 3
    const long = streakAnalyzer.analyze(ctxFor(LONG_STREAK)); // streak 8
    expect(short.signal).toBe(AnalysisSignal.BANKER);
    expect(long.signal).toBe(AnalysisSignal.BANKER);
    // Strength reacts to the current-shoe evidence...
    expect(short.strength).toBeLessThan(long.strength);
    // ...but reliability (the module prior) does not.
    expect(short.reliability).toBe(long.reliability);
    expect(short.reliability).toBe(RELIABILITY_PRIORS.streak);
  });

  it('run-length reliability is its prior when activated (distinct from streak)', () => {
    const r = runLengthAnalyzer.analyze(
      ctxFor(shoe([P, P, P, P, P, B, B, B, B, B, P])),
    );
    expect(r.signal).not.toBe(AnalysisSignal.ABSTAIN);
    expect(r.reliability).toBe(RELIABILITY_PRIORS['run-length']);
    expect(r.reliability).toBe(0.45);
  });
});

// ---------------------------------------------------------------------------
describe('reliability — activation & bounds', () => {
  it('directional modules still ABSTAIN below the warm-up (reliability 0)', () => {
    const ctx = ctxFor(shoe([P, B, P, B, P, B, P])); // 7 non-Tie
    for (const m of [
      streakAnalyzer,
      chopAnalyzer,
      runLengthAnalyzer,
      distributionAnalyzer,
      regimeTransitionAnalyzer,
    ]) {
      const r = m.analyze(ctx);
      expect(r.signal).toBe(AnalysisSignal.ABSTAIN);
      expect(r.reliability).toBe(0);
    }
  });

  it('reliability stays within [0,1] for every module across many shoes', () => {
    const shoes = [
      shoe([P]),
      shoe([P, B, P]),
      STABLE_8,
      VOLATILE_MIX,
      STABLE_12,
      shoe([P, P, P, P, P, B, B, B, B, B, P]),
    ];
    const modules = [
      streakAnalyzer,
      chopAnalyzer,
      runLengthAnalyzer,
      distributionAnalyzer,
      regimeTransitionAnalyzer,
      dataQualityGuard,
      volatilityAnalyzer,
      derivedRoadAnalyzer,
      historicalMatcher,
    ];
    for (const s of shoes) {
      const ctx = ctxFor(s);
      for (const m of modules) {
        const r = m.analyze(ctx);
        expect(r.reliability).toBeGreaterThanOrEqual(0);
        expect(r.reliability).toBeLessThanOrEqual(1);
      }
    }
  });

  it('identical inputs remain deterministic (reliability included)', () => {
    const rounds = shoe([B, B, B, P, P, B, B, P, B, B]);
    expect(runAnalysis(ctxFor(rounds))).toEqual(runAnalysis(ctxFor(rounds.slice())));
  });
});

// ---------------------------------------------------------------------------
describe('reliability — module modes preserved', () => {
  it('Historical Matcher remains DISABLED and is never computed', () => {
    expect(historicalMatcher.status).toBe(ModuleStatus.DISABLED);
    const disabled = historicalMatcher.analyze(ctxFor(STABLE_8));
    expect(disabled.signal).toBe(AnalysisSignal.ABSTAIN);
    expect(disabled.reliability).toBe(0);
    const report = runAnalysis(ctxFor(STABLE_8));
    expect(report.results.find((r) => r.moduleId === 'historical-matcher')).toBeUndefined();
  });

  it('Volatility & Derived Road remain SHADOW_ONLY (never influential)', () => {
    const report = runAnalysis(ctxFor(STABLE_8));
    const shadowIds = report.shadowResults.map((r) => r.moduleId);
    expect(shadowIds).toEqual(expect.arrayContaining(['volatility', 'derived-road']));
    const activeIds = report.activeResults.map((r) => r.moduleId);
    expect(activeIds).not.toContain('volatility');
    expect(activeIds).not.toContain('derived-road');
    for (const r of report.shadowResults) {
      expect(r.status).toBe(ModuleStatus.SHADOW_ONLY);
    }
  });

  it('Data Quality Guard stays non-directional with a fixed prior', () => {
    // Rounds with KNOWN pairs => data-quality (strength) = 1, distinct from the
    // guard's fixed reliability prior (0.5). Proves reliability is decoupled
    // from current-shoe data quality.
    const rounds: RoundRecord[] = [B, B, B, B, B, B, B, B].map((w, i) => ({
      id: `${SHOE}-dq${i + 1}`,
      shoeId: SHOE,
      roundNumber: i + 1,
      winner: w,
      playerPair: PairState.NO,
      bankerPair: PairState.NO,
      source: RoundSource.HISTORY,
      createdAt: '2026-01-01T00:00:00.000Z',
    }));
    const r = dataQualityGuard.analyze(ctxFor(rounds));
    expect(r.signal).toBe(AnalysisSignal.NEUTRAL); // never a side
    expect(r.strength).toBe(1); // data-quality evidence lives in `strength`
    expect(r.reliability).toBe(RELIABILITY_PRIORS['data-quality-guard']);
    // ...and `reliability` is NOT the current-shoe data-quality value.
    expect(r.reliability).not.toBe(r.strength);
  });
});
