/**
 * M7.1 Patch 2.1 — Near-Threshold Diagnostics + Safe Threshold Simulation.
 *
 * Deterministic, OBSERVABILITY-ONLY tests. They prove:
 *   §16 exact confidence-bucket + near-threshold boundaries,
 *   §17 coverage / reason aggregation with explicit denominators,
 *   §18 the THRESHOLD_ONLY classifier against ACTUAL accepted decide() trace,
 *   §19 the safe threshold simulation (0.55/0.54/0.53/0.52) never mutates any
 *       production decision and never converts OTHER_GATE / NOT_AVAILABLE.
 */
import {
  AnalysisSignal,
  type ModuleAnalysis,
} from '@/src/domain/analysis';
import { ModuleStatus, PredictionDecision } from '@/src/domain/models/enums';
import { decide, type DecisionContext } from '@/src/domain/decision';
import {
  bucketConfidence,
  classifyThresholdBlocker,
  computeNearThresholdReport,
  ConfidenceBucket,
  isNearThresholdConfidence,
  simulateThresholds,
  SIMULATION_THRESHOLDS,
  SkipReason,
  type ThresholdDecisionEntry,
} from '@/src/domain/observability';

const P = AnalysisSignal.PLAYER;
const B = AnalysisSignal.BANKER;

function mr(
  moduleId: string,
  signal: AnalysisSignal,
  strength: number,
  reliability: number,
  status: ModuleStatus = ModuleStatus.ACTIVE,
): ModuleAnalysis {
  return { moduleId, signal, strength, reliability, status, reasonCodes: [], riskFlags: [], version: 'TEST' };
}

function ctx(overrides: Partial<DecisionContext> = {}): DecisionContext {
  return {
    nonTieCount: overrides.nonTieCount ?? 15,
    regimeTransitioning: overrides.regimeTransitioning ?? false,
    recentPatternBreaks: overrides.recentPatternBreaks ?? 0,
    dataQuality: {
      warmupMet: true,
      winnerCompleteness: 1,
      pairCompleteness: 1,
      revisions: 0,
      missingRounds: 0,
      ...(overrides.dataQuality ?? {}),
    },
  };
}

const codes = (r: ReturnType<typeof decide>) => [...r.active.reasonCodes] as string[];
const flags = (r: ReturnType<typeof decide>) => [...r.active.riskFlags] as string[];

const skip = (
  confidence: number | null | undefined,
  reasonCodes?: readonly string[],
  riskFlags?: readonly string[],
): ThresholdDecisionEntry => ({ decision: 'SKIP', confidence, reasonCodes, riskFlags });
const bet = (side: 'PLAYER' | 'BANKER', confidence = 0.6): ThresholdDecisionEntry => ({
  decision: side === 'PLAYER' ? 'BET_PLAYER' : 'BET_BANKER',
  confidence,
  reasonCodes: ['DIRECTIONAL_CONSENSUS', 'DATA_QUALITY_PASS', 'NO_RISK'],
  riskFlags: [],
});

// A proven THRESHOLD_ONLY skip trace (INSUFFICIENT_EVIDENCE + DATA_QUALITY_PASS,
// only the near-threshold soft flag).
const thresholdOnlyTrace = {
  reasonCodes: ['INSUFFICIENT_EVIDENCE', 'DATA_QUALITY_PASS'] as const,
  riskFlags: ['CONFIDENCE_NEAR_THRESHOLD'] as const,
};

// ===========================================================================
// §16 — EXACT CONFIDENCE-BUCKET + NEAR-THRESHOLD BOUNDARIES
// ===========================================================================
describe('§16 exact bucket + near-threshold boundaries', () => {
  const cases: [number, ConfidenceBucket, boolean][] = [
    [0.4999, ConfidenceBucket.LT_050, false],
    [0.5, ConfidenceBucket.B_050_052, false],
    [0.519999, ConfidenceBucket.B_050_052, false],
    [0.52, ConfidenceBucket.B_052_053, true],
    [0.529999, ConfidenceBucket.B_052_053, true],
    [0.53, ConfidenceBucket.B_053_054, true],
    [0.539999, ConfidenceBucket.B_053_054, true],
    [0.54, ConfidenceBucket.B_054_055, true],
    [0.549999, ConfidenceBucket.B_054_055, true],
    [0.55, ConfidenceBucket.GTE_055, false],
  ];

  it.each(cases)('c=%s -> bucket + near=%s', (c, bucket, near) => {
    expect(bucketConfidence(c)).toBe(bucket);
    expect(isNearThresholdConfidence(c)).toBe(near);
  });

  it('0.55 is NOT near-threshold and buckets as >= 0.55', () => {
    expect(bucketConfidence(0.55)).toBe(ConfidenceBucket.GTE_055);
    expect(isNearThresholdConfidence(0.55)).toBe(false);
  });
});

// ===========================================================================
// §17 — COVERAGE / REASONS / EXPLICIT DENOMINATORS
// ===========================================================================
describe('§17 coverage + reason aggregation', () => {
  it('confidence missing on a SKIP => counted as unavailable, not silently dropped', () => {
    const r = computeNearThresholdReport([skip(null), skip(undefined)]);
    expect(r.officialSkip).toBe(2);
    expect(r.analyzableSkip).toBe(0);
    expect(r.unavailableSkip).toBe(2);
    expect(r.nearThresholdPct).toBeNull();
  });

  it('trace missing on an analyzable SKIP => classification NOT_AVAILABLE (still analyzable/bucketed)', () => {
    const r = computeNearThresholdReport([skip(0.53)]);
    expect(r.analyzableSkip).toBe(1);
    expect(r.classification.notAvailable).toBe(1);
    expect(r.classification.thresholdOnly).toBe(0);
    expect(r.distribution[ConfidenceBucket.B_053_054]).toBe(1);
  });

  it('mixed analyzable + unavailable entries keep explicit denominators', () => {
    const r = computeNearThresholdReport([
      bet('BANKER'),
      skip(0.54, thresholdOnlyTrace.reasonCodes, thresholdOnlyTrace.riskFlags),
      skip(0.4, ['NO_DIRECTIONAL_SIGNAL', 'DATA_QUALITY_PASS']),
      skip(null),
    ]);
    expect(r.eligible).toBe(4);
    expect(r.officialBet).toBe(1);
    expect(r.officialSkip).toBe(3);
    expect(r.analyzableSkip).toBe(2);
    expect(r.unavailableSkip).toBe(1);
    expect(r.nearThresholdSkip).toBe(1); // only the 0.54 one
    expect(r.nearThresholdPct).toBeCloseTo(0.5, 6); // 1 / 2 analyzable
  });

  it('BELOW_THRESHOLD reason aggregates for near-threshold SKIPs', () => {
    const r = computeNearThresholdReport([
      skip(0.54, ['INSUFFICIENT_EVIDENCE', 'DATA_QUALITY_PASS'], ['CONFIDENCE_NEAR_THRESHOLD']),
      skip(0.53, ['INSUFFICIENT_EVIDENCE', 'DATA_QUALITY_PASS'], []),
    ]);
    expect(r.nearThresholdReasons[SkipReason.BELOW_THRESHOLD]).toBe(2);
  });

  it('conflict / single-family reasons aggregate for near-threshold SKIPs', () => {
    const r = computeNearThresholdReport([
      skip(0.54, ['INSUFFICIENT_EVIDENCE', 'DATA_QUALITY_PASS'], ['MODERATE_CONFLICT']),
      skip(0.53, ['INSUFFICIENT_EVIDENCE', 'DATA_QUALITY_PASS'], ['SINGLE_FAMILY_SUPPORT']),
    ]);
    expect(r.nearThresholdReasons[SkipReason.CONFLICT]).toBe(1);
    expect(r.nearThresholdReasons[SkipReason.SINGLE_FAMILY_SUPPORT]).toBe(1);
  });

  it('aggregation is deterministic (order independent)', () => {
    const entries = [
      bet('PLAYER'),
      skip(0.54, thresholdOnlyTrace.reasonCodes, thresholdOnlyTrace.riskFlags),
      skip(0.49, ['NO_DIRECTIONAL_SIGNAL', 'DATA_QUALITY_PASS']),
      skip(null),
    ];
    const a = computeNearThresholdReport(entries);
    const b = computeNearThresholdReport([...entries].reverse());
    expect(a).toEqual(b);
  });

  it('exact distribution buckets are computed with numeric comparisons', () => {
    const r = computeNearThresholdReport([
      skip(0.4999), skip(0.5), skip(0.519999), skip(0.52), skip(0.53), skip(0.54), skip(0.549999),
    ]);
    expect(r.distribution[ConfidenceBucket.LT_050]).toBe(1);
    expect(r.distribution[ConfidenceBucket.B_050_052]).toBe(2);
    expect(r.distribution[ConfidenceBucket.B_052_053]).toBe(1);
    expect(r.distribution[ConfidenceBucket.B_053_054]).toBe(1);
    expect(r.distribution[ConfidenceBucket.B_054_055]).toBe(2);
    expect(r.distribution[ConfidenceBucket.GTE_055]).toBe(0);
  });
});

// ===========================================================================
// §18 — THRESHOLD CLASSIFIER against ACTUAL accepted decide() semantics
// ===========================================================================
describe('§18 threshold classifier (actual decide() trace)', () => {
  it('threshold sole blocker => THRESHOLD_ONLY (3 modules / 2 families, low evidence)', () => {
    const r = decide([mr('streak', B, 0.28, 0.5), mr('run-length', B, 0.2, 0.5), mr('chop', B, 0.2, 0.5)], ctx());
    expect(r.active.decision).toBe(PredictionDecision.SKIP);
    expect(codes(r)).toContain('INSUFFICIENT_EVIDENCE');
    expect(codes(r)).toContain('DATA_QUALITY_PASS');
    expect(flags(r)).not.toContain('STRONG_OPPOSITION');
    expect(r.active.confidence).toBeLessThan(0.55);
    expect(classifyThresholdBlocker(codes(r), flags(r))).toBe('THRESHOLD_ONLY');
  });

  it('strong opposition also blocks => OTHER_GATE', () => {
    const r = decide([mr('streak', P, 1, 0.5), mr('distribution', P, 0.45, 0.4), mr('chop', B, 0.82, 0.5)], ctx());
    expect(r.active.decision).toBe(PredictionDecision.SKIP);
    expect(flags(r)).toContain('STRONG_OPPOSITION');
    expect(classifyThresholdBlocker(codes(r), flags(r))).toBe('OTHER_GATE');
  });

  it('DQG blocks even with low confidence => OTHER_GATE (no DATA_QUALITY_PASS)', () => {
    const r = decide(
      [mr('streak', B, 0.28, 0.5), mr('run-length', B, 0.2, 0.5), mr('chop', B, 0.2, 0.5)],
      ctx({ nonTieCount: 5, dataQuality: { warmupMet: false, winnerCompleteness: 1, pairCompleteness: 1, revisions: 0, missingRounds: 0 } }),
    );
    expect(r.active.decision).toBe(PredictionDecision.SKIP);
    expect(codes(r)).toContain('DATA_QUALITY_BLOCK');
    expect(codes(r)).not.toContain('DATA_QUALITY_PASS');
    expect(classifyThresholdBlocker(codes(r), flags(r))).toBe('OTHER_GATE');
  });

  it('multiple soft-risk flags block => OTHER_GATE (single family + low module count)', () => {
    const r = decide([mr('streak', B, 0.4, 0.5), mr('run-length', B, 0.3, 0.5)], ctx());
    expect(r.active.decision).toBe(PredictionDecision.SKIP);
    expect(codes(r)).toContain('INSUFFICIENT_EVIDENCE');
    expect(codes(r)).toContain('DATA_QUALITY_PASS');
    // 2 modules => LOW_MODULE_COUNT, 1 family => SINGLE_FAMILY_SUPPORT (>=2 soft).
    const soft = flags(r).filter((f) => f !== 'STRONG_OPPOSITION');
    expect(soft.length).toBeGreaterThanOrEqual(2);
    expect(classifyThresholdBlocker(codes(r), flags(r))).toBe('OTHER_GATE');
  });

  it('directional-support gate blocks => OTHER_GATE (single directional module)', () => {
    const r = decide([mr('streak', B, 0.5, 0.5)], ctx());
    expect(r.active.decision).toBe(PredictionDecision.SKIP);
    expect(codes(r)).toContain('INSUFFICIENT_DIRECTIONAL_MODULES');
    expect(codes(r)).not.toContain('INSUFFICIENT_EVIDENCE');
    expect(classifyThresholdBlocker(codes(r), flags(r))).toBe('OTHER_GATE');
  });

  it('missing mandatory trace => NOT_AVAILABLE', () => {
    expect(classifyThresholdBlocker(undefined, undefined)).toBe('NOT_AVAILABLE');
    expect(classifyThresholdBlocker(null, ['CONFIDENCE_NEAR_THRESHOLD'])).toBe('NOT_AVAILABLE');
  });

  it('exactly one soft flag is still THRESHOLD_ONLY; two soft flags are not', () => {
    expect(classifyThresholdBlocker(['INSUFFICIENT_EVIDENCE', 'DATA_QUALITY_PASS'], ['CONFIDENCE_NEAR_THRESHOLD'])).toBe('THRESHOLD_ONLY');
    expect(classifyThresholdBlocker(['INSUFFICIENT_EVIDENCE', 'DATA_QUALITY_PASS'], ['CONFIDENCE_NEAR_THRESHOLD', 'LOW_MODULE_COUNT'])).toBe('OTHER_GATE');
  });
});

// ===========================================================================
// §19 — SAFE THRESHOLD SIMULATION (0.55 / 0.54 / 0.53 / 0.52)
// ===========================================================================
describe('§19 safe threshold simulation', () => {
  const to = thresholdOnlyTrace;
  const entries: ThresholdDecisionEntry[] = [
    bet('BANKER'), // 1 official BET
    skip(0.54, to.reasonCodes, to.riskFlags), // THRESHOLD_ONLY conf 0.54
    skip(0.53, ['INSUFFICIENT_EVIDENCE', 'DATA_QUALITY_PASS'], []), // THRESHOLD_ONLY conf 0.53
    skip(0.52, ['INSUFFICIENT_EVIDENCE', 'DATA_QUALITY_PASS'], []), // THRESHOLD_ONLY conf 0.52
    skip(0.54, ['INSUFFICIENT_EVIDENCE', 'DATA_QUALITY_PASS'], ['STRONG_OPPOSITION']), // OTHER_GATE
    skip(0.54, undefined), // NOT_AVAILABLE
  ];

  it('reports all four thresholds and is marked available', () => {
    const sim = simulateThresholds(entries);
    expect(sim.available).toBe(true);
    expect(sim.results.map((r) => r.threshold)).toEqual([...SIMULATION_THRESHOLDS]);
    expect(sim.denominator).toBe(6);
  });

  it('0.55 potential BET equals the official BET count (production identity)', () => {
    const sim = simulateThresholds(entries);
    const t55 = sim.results.find((r) => r.threshold === 0.55)!;
    expect(t55.additionalPotentialBet).toBe(0);
    expect(t55.totalPotentialBet).toBe(1);
    expect(t55.officialBet).toBe(1);
  });

  it('lowering the threshold monotonically adds only THRESHOLD_ONLY conversions', () => {
    const sim = simulateThresholds(entries);
    const at = (t: number) => sim.results.find((r) => r.threshold === t)!;
    expect(at(0.55).additionalPotentialBet).toBe(0);
    expect(at(0.54).additionalPotentialBet).toBe(1); // conf 0.54
    expect(at(0.53).additionalPotentialBet).toBe(2); // conf 0.54, 0.53
    expect(at(0.52).additionalPotentialBet).toBe(3); // conf 0.54, 0.53, 0.52
    expect(at(0.52).totalPotentialBet).toBe(4);
  });

  it('OTHER_GATE and NOT_AVAILABLE records NEVER convert at any threshold', () => {
    const only = [
      skip(0.54, ['INSUFFICIENT_EVIDENCE', 'DATA_QUALITY_PASS'], ['STRONG_OPPOSITION']),
      skip(0.54, undefined),
      skip(0.54, ['DATA_QUALITY_BLOCK']),
    ];
    const sim = simulateThresholds(only);
    for (const r of sim.results) {
      expect(r.additionalPotentialBet).toBe(0);
      expect(r.totalPotentialBet).toBe(0);
    }
  });

  it('is deterministic and does not mutate the input entries (no production side effects)', () => {
    const snapshot = JSON.parse(JSON.stringify(entries));
    const a = simulateThresholds(entries);
    const b = simulateThresholds([...entries].reverse());
    expect(a).toEqual(b);
    // Input untouched — no Engine/Played sequence or ledger surface exists here.
    expect(entries).toEqual(snapshot);
  });

  it('simulation report exposes NO sequence / paper / played fields', () => {
    const sim = simulateThresholds(entries);
    const keys = Object.keys(sim.results[0]);
    expect(keys).toEqual([
      'threshold',
      'denominator',
      'officialBet',
      'additionalPotentialBet',
      'totalPotentialBet',
      'potentialBetRate',
    ]);
  });
});
