/**
 * Milestone 4 — FINAL ACCEPTANCE AUDIT regression tests.
 *
 * Audit-only additive tests. They lock: permutation invariance of the family
 * cap, ACTIVE/SHADOW isolation, Data-Quality-Gate vs Risk-Filter ownership,
 * literal confidence boundaries, risk invariants, and four HAND-CALCULATED
 * golden vectors (expected values written literally, never produced by calling
 * the production implementation).
 */
import { ModuleStatus, PredictionCategory, PredictionDecision } from '@/src/domain/models/enums';
import { AnalysisSignal, type ModuleAnalysis } from '@/src/domain/analysis';
import {
  DataQualityLevel,
  DecisionRiskFlag,
  ModuleFamily,
  RiskLevel,
  VoteSide,
  categoryFromConfidence,
  confidenceFromWinnerScore,
  DECISION_CONFIG,
  decide,
} from '@/src/domain/decision';
import type { DecisionContext } from '@/src/domain/decision';

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

const family = (r: ReturnType<typeof decide>, f: ModuleFamily) =>
  r.familyContributions.find((c) => c.family === f);

// permutation helper
function permutations<T>(arr: readonly T[]): T[][] {
  if (arr.length <= 1) return [arr.slice()];
  const out: T[][] = [];
  arr.forEach((item, i) => {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([item, ...p]);
  });
  return out;
}

// ===========================================================================
// 3. FAMILY CAP DETERMINISM / PERMUTATION INVARIANCE
// ===========================================================================
describe('audit §3 — family cap is permutation invariant', () => {
  const vector = [
    mr('streak', P, 0.8, 0.5), // Trend, w=0.40
    mr('run-length', P, 0.6, 0.45), // Trend, w=0.27
    mr('distribution', P, 0.7, 0.4), // Trend, w=0.28
    mr('chop', P, 0.5, 0.5), // Alternation, w=0.25
  ];

  const signature = (r: ReturnType<typeof decide>) => ({
    playerScore: r.playerScore,
    bankerScore: r.bankerScore,
    weightedAgreement: r.weightedAgreement,
    conflictScore: r.conflictScore,
    rawConfidence: r.rawConfidence,
    rawCategory: r.rawCategory,
    trendPlayer: family(r, ModuleFamily.TREND)?.player,
    finalSide: r.active.side,
    finalCategory: r.active.category,
    decision: r.active.decision,
  });

  it('all 24 permutations of the Trend+Alternation vector produce identical decisions', () => {
    const baseline = signature(decide(vector, ctx()));
    // Descending sort by weight => Trend player = 0.40 + 0.5*0.28 + 0.25*0.27 = 0.6075
    expect(baseline.trendPlayer).toBe(0.6075);
    const perms = permutations(vector);
    expect(perms.length).toBe(24);
    for (const p of perms) {
      expect(signature(decide(p, ctx()))).toEqual(baseline);
    }
  });

  it('equal-weight ties inside a family are order independent', () => {
    const a = decide([mr('streak', P, 1, 0.5), mr('run-length', P, 1, 0.5), mr('distribution', P, 1, 0.5)], ctx());
    const b = decide([mr('distribution', P, 1, 0.5), mr('streak', P, 1, 0.5), mr('run-length', P, 1, 0.5)], ctx());
    expect(a.playerScore).toBe(b.playerScore);
    expect(a.playerScore).toBe(0.875);
  });
});

// ===========================================================================
// 4. ACTIVE / SHADOW ISOLATION
// ===========================================================================
describe('audit §4 — active/shadow isolation', () => {
  it('SHADOW_ONLY (volatility, derived-road) and DISABLED (historical) never vote', () => {
    const r = decide(
      [
        mr('streak', B, 1, 0.5),
        mr('chop', B, 1, 0.5),
        mr('volatility', P, 1, 1, ModuleStatus.SHADOW_ONLY),
        mr('derived-road', P, 1, 1, ModuleStatus.SHADOW_ONLY),
        mr('historical-matcher', P, 1, 1, ModuleStatus.DISABLED),
      ],
      ctx(),
    );
    expect(r.playerScore).toBe(0); // shadow/disabled player votes excluded
    expect(r.bankerScore).toBe(1); // only streak(0.5)+chop(0.5)
    expect(r.directionalModuleCount).toBe(2);
    expect(r.active.decision).toBe(PredictionDecision.BET_BANKER);
  });

  it('volatility (recentPatternBreaks) cannot change the ACTIVE record; only the SHADOW record', () => {
    const modules = [mr('streak', P, 1, 0.5), mr('chop', P, 1, 0.5)];
    const calm = decide(modules, ctx({ recentPatternBreaks: 0 }));
    const volatile = decide(modules, ctx({ recentPatternBreaks: 5 }));
    // ACTIVE identical (scores, confidence, category, decision, flags).
    expect(volatile.active).toEqual(calm.active);
    expect(volatile.playerScore).toBe(calm.playerScore);
    expect(volatile.rawConfidence).toBe(calm.rawConfidence);
    // SHADOW differs — it alone reflects the volatility signal.
    expect(volatile.shadow).not.toEqual(calm.shadow);
    expect(volatile.shadow.riskFlags).toContain(DecisionRiskFlag.RECENT_PATTERN_BREAK);
    expect(calm.shadow.riskFlags).not.toContain(DecisionRiskFlag.RECENT_PATTERN_BREAK);
  });
});

// ===========================================================================
// 5. DATA-QUALITY-GATE vs RISK-FILTER OWNERSHIP (no double penalty)
// ===========================================================================
describe('audit §5 — DQG vs Risk ownership', () => {
  // Strong banker HIGH-raw vector (rawConfidence 0.720833) reused across levels.
  const strongBanker = [
    mr('streak', B, 1, 0.5),
    mr('distribution', B, 1, 0.4),
    mr('run-length', B, 1, 0.45),
    mr('chop', B, 1, 0.5),
  ];

  it('PASS — normal processing, category retained', () => {
    const r = decide(strongBanker, ctx());
    expect(r.dataQualityLevel).toBe(DataQualityLevel.PASS);
    expect(r.rawCategory).toBe(PredictionCategory.HIGH_RECOMMENDATION);
    expect(r.active.category).toBe(PredictionCategory.HIGH_RECOMMENDATION);
    expect(r.active.riskFlags).not.toContain(DecisionRiskFlag.MEDIUM_DATA_QUALITY);
  });

  it('LIMIT — gate caps once (HIGH->QUALIFIED, conf 0.69); risk adds no second downgrade', () => {
    const r = decide(
      strongBanker,
      ctx({ dataQuality: { warmupMet: true, winnerCompleteness: 1, pairCompleteness: 0, revisions: 0, missingRounds: 0 } }),
    );
    expect(r.dataQualityLevel).toBe(DataQualityLevel.LIMIT);
    expect(r.rawCategory).toBe(PredictionCategory.HIGH_RECOMMENDATION);
    // Gate owns the cap:
    expect(r.active.category).toBe(PredictionCategory.QUALIFIED);
    expect(r.active.confidence).toBe(0.69);
    // Risk records the flag but does NOT downgrade a second time (LIMIT alone => LOW/retain):
    expect(r.active.riskFlags).toContain(DecisionRiskFlag.MEDIUM_DATA_QUALITY);
    expect(r.active.riskLevel).toBe(RiskLevel.LOW);
    expect(r.active.decision).toBe(PredictionDecision.BET_BANKER);
  });

  it('BLOCK — final decision is SKIP regardless of votes', () => {
    const r = decide(
      strongBanker,
      ctx({ nonTieCount: 5, dataQuality: { warmupMet: false, winnerCompleteness: 1, pairCompleteness: 1, revisions: 0, missingRounds: 0 } }),
    );
    expect(r.dataQualityLevel).toBe(DataQualityLevel.BLOCK);
    expect(r.active.decision).toBe(PredictionDecision.SKIP);
    expect(r.active.riskLevel).toBe(RiskLevel.CRITICAL);
  });
});

// ===========================================================================
// 6. CONFIDENCE BOUNDARIES (literal)
// ===========================================================================
describe('audit §6 — confidence band boundaries', () => {
  it('bands are half-open [lo, hi): 0.55 / 0.60 / 0.70 with max 0.75', () => {
    expect(categoryFromConfidence(0.5499)).toBe(PredictionCategory.BELOW_THRESHOLD);
    expect(categoryFromConfidence(0.55)).toBe(PredictionCategory.EXPERIMENTAL);
    expect(categoryFromConfidence(0.5999)).toBe(PredictionCategory.EXPERIMENTAL);
    expect(categoryFromConfidence(0.6)).toBe(PredictionCategory.QUALIFIED);
    expect(categoryFromConfidence(0.6999)).toBe(PredictionCategory.QUALIFIED);
    expect(categoryFromConfidence(0.7)).toBe(PredictionCategory.HIGH_RECOMMENDATION);
    expect(categoryFromConfidence(0.75)).toBe(PredictionCategory.HIGH_RECOMMENDATION);
  });

  it('raw confidence above 0.75 clamps to 0.75', () => {
    // winnerScore 5 => term (5-0.3)/1.2 = 3.9167 => raw 1.333 => clamp 0.75
    expect(confidenceFromWinnerScore(5, DECISION_CONFIG)).toBe(0.75);
    expect(confidenceFromWinnerScore(100, DECISION_CONFIG)).toBe(0.75);
  });

  it('winner score below the evidence floor yields a below-threshold confidence', () => {
    expect(confidenceFromWinnerScore(0.2, DECISION_CONFIG)).toBeLessThan(0.55);
  });
});

// ===========================================================================
// 7. RISK INVARIANTS
// ===========================================================================
describe('audit §7 — risk filter invariants', () => {
  it('exposes exactly the nine specified flags', () => {
    expect(Object.keys(DecisionRiskFlag).sort()).toEqual(
      [
        'CONFIDENCE_NEAR_THRESHOLD',
        'LOW_MODULE_COUNT',
        'LOW_SAMPLE_RELIABILITY',
        'MEDIUM_DATA_QUALITY',
        'MODERATE_CONFLICT',
        'RECENT_PATTERN_BREAK',
        'REGIME_TRANSITION',
        'SINGLE_FAMILY_SUPPORT',
        'STRONG_OPPOSITION',
      ].sort(),
    );
  });

  it('never reverses side, never raises category/confidence; downgrade is at most one step', () => {
    const cases = [
      decide([mr('streak', P, 0.4, 0.5), mr('chop', P, 0.5, 0.5)], ctx()),
      decide([mr('streak', B, 0.8, 0.5), mr('distribution', B, 0.7, 0.4), mr('chop', B, 0.6, 0.5)], ctx()),
      // strong player w/ strong banker opposition -> must SKIP, never flip
      decide([mr('streak', P, 1, 0.5), mr('distribution', P, 0.45, 0.4), mr('chop', B, 0.82, 0.5)], ctx()),
      // HIGH raw + two soft risks -> downgrade exactly one
      decide(
        [mr('streak', B, 1, 0.5), mr('distribution', B, 1, 0.4), mr('run-length', B, 1, 0.45), mr('chop', B, 1, 0.5)],
        ctx({ regimeTransitioning: true, nonTieCount: 8 }),
      ),
    ];
    const idx = { BELOW_THRESHOLD: 0, EXPERIMENTAL: 1, QUALIFIED: 2, HIGH_RECOMMENDATION: 3 } as const;
    for (const r of cases) {
      const winner = r.playerScore > r.bankerScore ? VoteSide.PLAYER : r.bankerScore > r.playerScore ? VoteSide.BANKER : null;
      // side is winner or null, never the opposite
      expect([winner, null]).toContain(r.active.side);
      if (r.active.decision === PredictionDecision.BET_PLAYER) expect(winner).toBe(VoteSide.PLAYER);
      if (r.active.decision === PredictionDecision.BET_BANKER) expect(winner).toBe(VoteSide.BANKER);
      // confidence never raised, category never raised
      expect(r.active.confidence).toBeLessThanOrEqual(r.rawConfidence + 1e-9);
      expect(idx[r.active.category]).toBeLessThanOrEqual(idx[r.rawCategory]);
      // For PASS quality, a retained/downgraded BET drops by at most one category.
      if (
        r.dataQualityLevel === DataQualityLevel.PASS &&
        r.active.category !== PredictionCategory.BELOW_THRESHOLD
      ) {
        expect(idx[r.rawCategory] - idx[r.active.category]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('strong opposition converts a would-be BET into SKIP without flipping side', () => {
    const r = decide([mr('streak', P, 1, 0.5), mr('distribution', P, 0.45, 0.4), mr('chop', B, 0.82, 0.5)], ctx());
    expect(r.rawCategory).not.toBe(PredictionCategory.BELOW_THRESHOLD);
    expect(r.active.decision).toBe(PredictionDecision.SKIP);
    expect(r.active.side).toBeNull();
  });
});

// ===========================================================================
// 8. LITERAL GOLDEN VECTORS (hand-calculated; expected values written literally)
// ===========================================================================
describe('audit §8 — literal golden vectors', () => {
  it('Golden 1 — PLAYER (Qualified)', () => {
    // streak P 0.8*0.5=0.40 ; distribution P 0.7*0.4=0.28 ; chop P 0.6*0.5=0.30
    // Trend(P) = 0.40 + 0.5*0.28 = 0.54 ; Alternation(P)=0.30 ; playerScore=0.84
    // agreement=1 ; conflict=0 ; evidence=(0.84-0.30)/1.20=0.45 ; conf=0.55+0.20*0.45=0.64 -> QUALIFIED
    const r = decide([mr('streak', P, 0.8, 0.5), mr('distribution', P, 0.7, 0.4), mr('chop', P, 0.6, 0.5)], ctx());
    expect(r.playerScore).toBe(0.84);
    expect(r.bankerScore).toBe(0);
    expect(r.weightedAgreement).toBe(1);
    expect(r.conflictScore).toBe(0);
    expect(r.rawConfidence).toBe(0.64);
    expect(r.active.decision).toBe(PredictionDecision.BET_PLAYER);
    expect(r.active.side).toBe(VoteSide.PLAYER);
    expect(r.active.category).toBe(PredictionCategory.QUALIFIED);
    expect(r.draft).toEqual({ isDraft: true, decision: PredictionDecision.BET_PLAYER, side: VoteSide.PLAYER, confidence: 0.64, category: PredictionCategory.QUALIFIED });
  });

  it('Golden 2 — BANKER (Experimental)', () => {
    // streak B 0.4*0.5=0.20 ; chop B 0.5*0.5=0.25 ; bankerScore=0.45
    // evidence=(0.45-0.30)/1.20=0.125 ; conf=0.55+0.20*0.125=0.575 -> EXPERIMENTAL
    const r = decide([mr('streak', B, 0.4, 0.5), mr('chop', B, 0.5, 0.5)], ctx());
    expect(r.bankerScore).toBe(0.45);
    expect(r.playerScore).toBe(0);
    expect(r.weightedAgreement).toBe(1);
    expect(r.rawConfidence).toBe(0.575);
    expect(r.active.decision).toBe(PredictionDecision.BET_BANKER);
    expect(r.active.category).toBe(PredictionCategory.EXPERIMENTAL);
    expect(r.active.confidence).toBe(0.575);
  });

  it('Golden 3 — family-correlation cap (single family)', () => {
    // 3 Trend P each 1*0.5=0.5 -> Trend(P)=0.5 + 0.25 + 0.125 = 0.875 (naive sum would be 1.5)
    // evidence=(0.875-0.30)/1.20=0.479166.. ; conf=0.55+0.20*0.479166..=0.645833
    const r = decide([mr('streak', P, 1, 0.5), mr('run-length', P, 1, 0.5), mr('distribution', P, 1, 0.5)], ctx());
    expect(r.familyContributions.find((c) => c.family === ModuleFamily.TREND)?.player).toBe(0.875);
    expect(r.playerScore).toBe(0.875);
    expect(r.rawConfidence).toBe(0.645833);
    expect(r.supportingFamilyCount).toBe(1);
    expect(r.active.riskFlags).toContain(DecisionRiskFlag.SINGLE_FAMILY_SUPPORT);
    expect(r.active.decision).toBe(PredictionDecision.BET_PLAYER);
    expect(r.active.category).toBe(PredictionCategory.QUALIFIED);
  });

  it('Golden 4 — conflict / SKIP (strong opposition)', () => {
    // Trend(P)= 0.5 + 0.5*0.18 = 0.59 ; Alternation(B)= 0.82*0.5 = 0.41
    // playerScore=0.59 ; bankerScore=0.41 ; agreement=0.59 ; conflict=0.41 (>=0.40 -> STRONG_OPPOSITION)
    // evidence=(0.59-0.30)/1.20=0.241666.. ; conf=0.598333 -> EXPERIMENTAL raw ; SKIP after risk
    const r = decide([mr('streak', P, 1, 0.5), mr('distribution', P, 0.45, 0.4), mr('chop', B, 0.82, 0.5)], ctx());
    expect(r.playerScore).toBe(0.59);
    expect(r.bankerScore).toBe(0.41);
    expect(r.weightedAgreement).toBe(0.59);
    expect(r.conflictScore).toBe(0.41);
    expect(r.rawConfidence).toBe(0.598333);
    expect(r.rawCategory).toBe(PredictionCategory.EXPERIMENTAL);
    expect(r.active.riskFlags).toContain(DecisionRiskFlag.STRONG_OPPOSITION);
    expect(r.active.decision).toBe(PredictionDecision.SKIP);
    expect(r.draft.decision).toBe(PredictionDecision.SKIP);
  });
});
