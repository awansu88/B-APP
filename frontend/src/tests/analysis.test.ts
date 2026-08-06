/**
 * Milestone 3 — Snapshot, Feature, and Analysis-module tests.
 *
 * Covers snapshot immutability, future-leakage prevention, deterministic
 * features, analyzer activation / insufficient-data, fixed analyzer outputs,
 * Tie handling, and full-pipeline determinism (same raw rounds + config +
 * version => identical features and module results). Pure domain; no UI/DB.
 */
import { ModuleStatus, RoundSource } from '@/src/domain/models/enums';
import { Winner } from '@/src/domain/models/outcome';
import { PairState } from '@/src/domain/models/pair';
import type { RoundRecord } from '@/src/domain/models/round';
import {
  SNAPSHOT_VERSION,
  buildShoeStateSnapshot,
  snapshotForTargetRound,
} from '@/src/domain/snapshot';
import {
  FEATURE_VERSION,
  Regime,
  extractFeatures,
} from '@/src/domain/features';
import {
  ANALYZER_VERSIONS,
  AnalysisSignal,
  ReasonCode,
  RiskFlag,
  chopAnalyzer,
  dataQualityGuard,
  derivedRoadAnalyzer,
  distributionAnalyzer,
  historicalMatcher,
  regimeTransitionAnalyzer,
  runAnalysis,
  runLengthAnalyzer,
  streakAnalyzer,
  volatilityAnalyzer,
} from '@/src/domain/analysis';

const SHOE = 'shoe-test';

function makeRound(
  n: number,
  winner: Winner,
  pp: PairState = PairState.UNKNOWN,
  bp: PairState = PairState.UNKNOWN,
): RoundRecord {
  return {
    id: `${SHOE}-r${n}`,
    shoeId: SHOE,
    roundNumber: n,
    winner,
    playerPair: pp,
    bankerPair: bp,
    source: RoundSource.HISTORY,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

/** Build a shoe from a winner list (Tie allowed). */
function shoe(winners: readonly Winner[]): RoundRecord[] {
  return winners.map((w, i) => makeRound(i + 1, w));
}

const P = Winner.PLAYER;
const B = Winner.BANKER;
const T = Winner.TIE;

const ctxFor = (rounds: readonly RoundRecord[]) => ({
  snapshot: buildShoeStateSnapshot(rounds),
  features: extractFeatures(rounds),
});

// ---------------------------------------------------------------------------
describe('snapshot — immutability', () => {
  it('returns a deeply frozen snapshot', () => {
    const snap = buildShoeStateSnapshot(shoe([P, B, P, B]));
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.currentStreak)).toBe(true);
    expect(Object.isFrozen(snap.bigRoad)).toBe(true);
    expect(Object.isFrozen(snap.derivedRoads)).toBe(true);
    expect(Object.isFrozen(snap.dataQuality)).toBe(true);
  });

  it('rejects mutation of a frozen snapshot (strict mode)', () => {
    const snap = buildShoeStateSnapshot(shoe([P, B]));
    expect(() => {
      // @ts-expect-error testing runtime immutability
      snap.completedRounds = 999;
    }).toThrow();
  });

  it('carries the locked snapshot version', () => {
    expect(buildShoeStateSnapshot(shoe([P])).snapshotVersion).toBe('SNAPSHOT-001');
    expect(SNAPSHOT_VERSION).toBe('SNAPSHOT-001');
  });
});

// ---------------------------------------------------------------------------
describe('snapshot — future-leakage prevention', () => {
  const full = shoe([P, B, B, P, T, B, P, B, P, B, P, B]); // 12 rounds

  it('a snapshot for target N uses only rounds before N', () => {
    const snapN = snapshotForTargetRound(full, 6);
    const fromPrefix = buildShoeStateSnapshot(full.slice(0, 5)); // rounds 1..5
    expect(snapN.completedRounds).toBe(5);
    expect(snapN.targetRoundNumber).toBe(6);
    expect(snapN).toEqual(fromPrefix);
  });

  it('future rounds never change a past target snapshot', () => {
    const short = full.slice(0, 5); // rounds 1..5 only
    const a = snapshotForTargetRound(full, 6);
    const b = snapshotForTargetRound(short, 6);
    expect(a).toEqual(b);
  });

  it('ignores a caller-supplied roadmap so it cannot leak future info', () => {
    // Even if a full-shoe roadmap is passed, target-6 snapshot uses prior rounds.
    const snapN = snapshotForTargetRound(full, 6, { revisionCount: 0 });
    expect(snapN.completedRounds).toBe(5);
    expect(snapN.nonTieRounds).toBe(4); // P,B,B,P (round5 is a Tie)
  });
});

// ---------------------------------------------------------------------------
describe('features — determinism & fixed values', () => {
  it('identical rounds always produce identical features', () => {
    const rounds = shoe([P, B, B, P, B, T, P, B, P]);
    expect(extractFeatures(rounds)).toEqual(extractFeatures(rounds.slice()));
  });

  it('computes fixed distribution/streak values for a known sequence', () => {
    const f = extractFeatures(shoe([B, B, B, B, B, B, B, B])); // 8 bankers
    expect(f.nonTieCount).toBe(8);
    expect(f.distribution.playerRatio).toBe(0);
    expect(f.distribution.bankerRatio).toBe(1);
    expect(f.streak.currentSide).toBe(B);
    expect(f.streak.currentStreak).toBe(8);
    expect(f.streak.maxRun).toBe(8);
    expect(f.regime.currentRegime).toBe(Regime.STREAKY);
  });

  it('classifies a perfect chop as CHOPPY', () => {
    const f = extractFeatures(shoe([P, B, P, B, P, B, P, B, P, B]));
    expect(f.chop.alternationRate).toBe(1);
    expect(f.regime.currentRegime).toBe(Regime.CHOPPY);
    expect(f.distribution.playerRatio).toBe(0.5);
  });

  it('carries the locked feature version', () => {
    expect(extractFeatures(shoe([P])).featureVersion).toBe('FEATURE-001');
    expect(FEATURE_VERSION).toBe('FEATURE-001');
  });
});

// ---------------------------------------------------------------------------
describe('features — Tie handling', () => {
  it('excludes Tie from non-Tie counts and streaks', () => {
    const f = extractFeatures(shoe([P, T, P, T, P])); // ties interleaved
    expect(f.nonTieCount).toBe(3);
    expect(f.streak.currentSide).toBe(P);
    expect(f.streak.currentStreak).toBe(3); // ties do not break the run
    expect(f.distribution.tieRatio).toBe(0.4); // 2 ties / 5 rounds
  });

  it('a Tie never advances toward the warm-up on the snapshot', () => {
    const snap = buildShoeStateSnapshot(shoe([T, T, T, P]));
    expect(snap.tieCount).toBe(3);
    expect(snap.nonTieRounds).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe('analyzers — activation & insufficient data', () => {
  it('active analyzers ABSTAIN below the 8 non-Tie warm-up', () => {
    const ctx = ctxFor(shoe([P, B, P, B, P, B, P])); // 7 non-Tie
    for (const m of [streakAnalyzer, chopAnalyzer, runLengthAnalyzer, distributionAnalyzer, regimeTransitionAnalyzer]) {
      const r = m.analyze(ctx);
      expect(r.signal).toBe(AnalysisSignal.ABSTAIN);
      expect(r.reasonCodes).toContain(ReasonCode.INSUFFICIENT_DATA);
      expect(r.riskFlags).toContain(RiskFlag.INSUFFICIENT_WARMUP);
    }
  });

  it('Data Quality Guard always reports (never ABSTAIN) and never picks a side', () => {
    const ctx = ctxFor(shoe([P, B, P])); // tiny shoe
    const r = dataQualityGuard.analyze(ctx);
    expect(r.status).toBe(ModuleStatus.ACTIVE);
    expect(r.signal).toBe(AnalysisSignal.NEUTRAL);
    expect(r.riskFlags).toContain(RiskFlag.INSUFFICIENT_WARMUP);
    expect(r.riskFlags).toContain(RiskFlag.LOW_PAIR_COMPLETENESS); // all pairs UNKNOWN
    expect(r.riskFlags).toContain(RiskFlag.HISTORY_UNCONFIRMED);
  });

  it('exposes the locked module statuses', () => {
    expect(streakAnalyzer.status).toBe(ModuleStatus.ACTIVE);
    expect(distributionAnalyzer.status).toBe(ModuleStatus.ACTIVE);
    expect(volatilityAnalyzer.status).toBe(ModuleStatus.SHADOW_ONLY);
    expect(derivedRoadAnalyzer.status).toBe(ModuleStatus.SHADOW_ONLY);
    expect(historicalMatcher.status).toBe(ModuleStatus.DISABLED);
  });

  it('module versions match the analyzer version registry', () => {
    expect(streakAnalyzer.version).toBe(ANALYZER_VERSIONS.streak);
    expect(volatilityAnalyzer.version).toBe(ANALYZER_VERSIONS.volatility);
    expect(historicalMatcher.version).toBe(ANALYZER_VERSIONS['historical-matcher']);
  });
});

// ---------------------------------------------------------------------------
describe('analyzers — fixed outputs (>= warm-up)', () => {
  it('Streak Analyzer follows a strong streak (8 bankers -> BANKER)', () => {
    const r = streakAnalyzer.analyze(ctxFor(shoe([B, B, B, B, B, B, B, B])));
    expect(r.signal).toBe(AnalysisSignal.BANKER);
    expect(r.reasonCodes).toContain(ReasonCode.STRONG_STREAK);
    expect(r.strength).toBeGreaterThan(0);
  });

  it('Distribution Analyzer leans to the skewed side (all bankers -> BANKER)', () => {
    const r = distributionAnalyzer.analyze(ctxFor(shoe([B, B, B, B, B, B, B, B])));
    expect(r.signal).toBe(AnalysisSignal.BANKER);
    expect(r.reasonCodes).toContain(ReasonCode.DISTRIBUTION_SKEW);
  });

  it('Distribution Analyzer is NEUTRAL when balanced (4P/4B)', () => {
    const r = distributionAnalyzer.analyze(ctxFor(shoe([P, B, P, B, P, B, P, B])));
    expect(r.signal).toBe(AnalysisSignal.NEUTRAL);
    expect(r.reasonCodes).toContain(ReasonCode.BALANCED_DISTRIBUTION);
  });

  it('Chop Analyzer continues a strong alternation (…P,B -> PLAYER)', () => {
    const r = chopAnalyzer.analyze(ctxFor(shoe([P, B, P, B, P, B, P, B, P, B])));
    expect(r.signal).toBe(AnalysisSignal.PLAYER); // opposite of last (B)
    expect(r.reasonCodes).toContain(ReasonCode.HIGH_ALTERNATION);
  });

  it('Run-Length Analyzer expects continuation for a fresh short run', () => {
    // PPPPP BBBBB P  -> current run P(1) well below the ~3.67 average
    const r = runLengthAnalyzer.analyze(ctxFor(shoe([P, P, P, P, P, B, B, B, B, B, P])));
    expect(r.signal).toBe(AnalysisSignal.PLAYER);
    expect(r.reasonCodes).toContain(ReasonCode.EXPECT_CONTINUATION);
  });

  it('Run-Length Analyzer expects a break for an over-long run', () => {
    // P B P B P B PPPP -> current run P(4) well above the ~1.43 average
    const r = runLengthAnalyzer.analyze(ctxFor(shoe([P, B, P, B, P, B, P, P, P, P])));
    expect(r.signal).toBe(AnalysisSignal.BANKER); // opposite of P
    expect(r.reasonCodes).toContain(ReasonCode.EXPECT_BREAK);
  });

  it('Regime Analyzer aligns with a streaky regime', () => {
    const r = regimeTransitionAnalyzer.analyze(ctxFor(shoe([B, B, B, B, B, B, B, B])));
    expect(r.signal).toBe(AnalysisSignal.BANKER);
    expect(r.reasonCodes).toContain(ReasonCode.REGIME_STREAKY);
  });
});

// ---------------------------------------------------------------------------
describe('runner — orchestration & shadow isolation', () => {
  const ctx = ctxFor(shoe([B, B, B, B, B, B, B, B, B]));

  it('does not compute DISABLED modules (Historical Matcher excluded)', () => {
    const report = runAnalysis(ctx);
    expect(report.results.find((r) => r.moduleId === 'historical-matcher')).toBeUndefined();
    expect(report.results).toHaveLength(8); // 9 modules - 1 disabled
  });

  it('separates ACTIVE (influential) from SHADOW results', () => {
    const report = runAnalysis(ctx);
    expect(report.activeResults).toHaveLength(6);
    expect(report.shadowResults).toHaveLength(2);
    // shadow modules are never in the influential/active set
    const activeIds = report.activeResults.map((r) => r.moduleId);
    expect(activeIds).not.toContain('volatility');
    expect(activeIds).not.toContain('derived-road');
    for (const r of report.shadowResults) {
      expect(r.status).toBe(ModuleStatus.SHADOW_ONLY);
    }
  });

  it('reports the locked snapshot & feature versions', () => {
    const report = runAnalysis(ctx);
    expect(report.snapshotVersion).toBe('SNAPSHOT-001');
    expect(report.featureVersion).toBe('FEATURE-001');
  });
});

// ---------------------------------------------------------------------------
describe('pipeline — full determinism', () => {
  it('same raw rounds + config + version => identical snapshot, features, results', () => {
    const rounds = shoe([P, B, B, P, T, B, P, B, P, B, P, P, B, T, P]);
    const a = ctxFor(rounds);
    const b = ctxFor(rounds.slice());
    expect(a.snapshot).toEqual(b.snapshot);
    expect(a.features).toEqual(b.features);
    expect(runAnalysis(a)).toEqual(runAnalysis(b));
  });

  it('module results are deterministic across repeated runs', () => {
    const ctx = ctxFor(shoe([B, B, B, P, P, B, B, P, B, B]));
    expect(runAnalysis(ctx)).toEqual(runAnalysis(ctx));
  });
});
