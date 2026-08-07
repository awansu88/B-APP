/**
 * Milestone 4 — Decision Pipeline deterministic fixed-vector tests.
 *
 * Each test feeds a fixed vector of module results + context to `decide(...)`
 * and asserts exact scores/categories/decisions. Pure domain; no UI/DB. The
 * pipeline performs NO persistence, NO prediction locking, and NO result
 * evaluation (Milestone 5+).
 */
import { ModuleStatus, PredictionCategory, PredictionDecision, RoundSource } from '@/src/domain/models/enums';
import { Winner } from '@/src/domain/models/outcome';
import { PairState } from '@/src/domain/models/pair';
import type { RoundRecord } from '@/src/domain/models/round';
import { AnalysisSignal, type ModuleAnalysis } from '@/src/domain/analysis';
import { buildShoeStateSnapshot } from '@/src/domain/snapshot';
import { extractFeatures } from '@/src/domain/features';
import {
  DataQualityLevel,
  DecisionReason,
  DecisionRiskFlag,
  ModuleFamily,
  RiskLevel,
  VoteSide,
  decide,
  runDecisionPipeline,
} from '@/src/domain/decision';
import type { DecisionContext } from '@/src/domain/decision';

// --- helpers ---------------------------------------------------------------
function mr(
  moduleId: string,
  signal: AnalysisSignal,
  strength: number,
  reliability: number,
  status: ModuleStatus = ModuleStatus.ACTIVE,
): ModuleAnalysis {
  return {
    moduleId,
    signal,
    strength,
    reliability,
    status,
    reasonCodes: [],
    riskFlags: [],
    version: 'TEST',
  };
}

const P = AnalysisSignal.PLAYER;
const B = AnalysisSignal.BANKER;

function ctx(overrides: Partial<DecisionContext> = {}): DecisionContext {
  return {
    nonTieCount: 15,
    regimeTransitioning: false,
    recentPatternBreaks: 0,
    dataQuality: {
      warmupMet: true,
      winnerCompleteness: 1,
      pairCompleteness: 1,
      revisions: 0,
      missingRounds: 0,
      ...(overrides.dataQuality ?? {}),
    },
    ...('nonTieCount' in overrides ? { nonTieCount: overrides.nonTieCount! } : {}),
    ...('regimeTransitioning' in overrides
      ? { regimeTransitioning: overrides.regimeTransitioning! }
      : {}),
    ...('recentPatternBreaks' in overrides
      ? { recentPatternBreaks: overrides.recentPatternBreaks! }
      : {}),
  };
}

const trendFamily = (r: ReturnType<typeof decide>) =>
  r.familyContributions.find((f) => f.family === ModuleFamily.TREND);

// ---------------------------------------------------------------------------
describe('decision — Experimental band', () => {
  it('Experimental Player (thin two-family support)', () => {
    const r = decide([mr('streak', P, 0.4, 0.5), mr('chop', P, 0.5, 0.5)], ctx());
    expect(r.playerScore).toBe(0.45);
    expect(r.bankerScore).toBe(0);
    expect(r.weightedAgreement).toBe(1);
    expect(r.rawConfidence).toBe(0.575);
    expect(r.rawCategory).toBe(PredictionCategory.EXPERIMENTAL);
    expect(r.active.decision).toBe(PredictionDecision.BET_PLAYER);
    expect(r.active.side).toBe(VoteSide.PLAYER);
    expect(r.active.category).toBe(PredictionCategory.EXPERIMENTAL);
    expect(r.active.confidence).toBe(0.575);
    expect(r.active.riskFlags).toContain(DecisionRiskFlag.LOW_MODULE_COUNT);
    expect(r.active.riskLevel).toBe(RiskLevel.LOW);
  });

  it('Experimental Banker (mirror)', () => {
    const r = decide([mr('streak', B, 0.4, 0.5), mr('chop', B, 0.5, 0.5)], ctx());
    expect(r.bankerScore).toBe(0.45);
    expect(r.active.decision).toBe(PredictionDecision.BET_BANKER);
    expect(r.active.side).toBe(VoteSide.BANKER);
    expect(r.active.category).toBe(PredictionCategory.EXPERIMENTAL);
    expect(r.active.confidence).toBe(0.575);
  });
});

describe('decision — Qualified band', () => {
  it('Qualified Player (three modules, no risk)', () => {
    const r = decide(
      [mr('streak', P, 0.8, 0.5), mr('distribution', P, 0.7, 0.4), mr('chop', P, 0.6, 0.5)],
      ctx(),
    );
    expect(trendFamily(r)?.player).toBe(0.54); // 0.40 + 0.5*0.28 (family cap)
    expect(r.playerScore).toBe(0.84);
    expect(r.rawConfidence).toBe(0.64);
    expect(r.active.decision).toBe(PredictionDecision.BET_PLAYER);
    expect(r.active.category).toBe(PredictionCategory.QUALIFIED);
    expect(r.active.confidence).toBe(0.64);
    expect(r.active.riskLevel).toBe(RiskLevel.NONE);
  });

  it('Qualified Banker (mirror)', () => {
    const r = decide(
      [mr('streak', B, 0.8, 0.5), mr('distribution', B, 0.7, 0.4), mr('chop', B, 0.6, 0.5)],
      ctx(),
    );
    expect(r.bankerScore).toBe(0.84);
    expect(r.active.decision).toBe(PredictionDecision.BET_BANKER);
    expect(r.active.category).toBe(PredictionCategory.QUALIFIED);
    expect(r.active.confidence).toBe(0.64);
  });
});

describe('decision — High recommendation', () => {
  it('High recommendation (strong multi-family evidence)', () => {
    const r = decide(
      [
        mr('streak', B, 1, 0.5),
        mr('distribution', B, 1, 0.4),
        mr('run-length', B, 1, 0.45),
        mr('chop', B, 1, 0.5),
      ],
      ctx(),
    );
    expect(trendFamily(r)?.banker).toBe(0.825); // 0.5 + 0.25*... capped
    expect(r.bankerScore).toBe(1.325);
    expect(r.rawCategory).toBe(PredictionCategory.HIGH_RECOMMENDATION);
    expect(r.active.decision).toBe(PredictionDecision.BET_BANKER);
    expect(r.active.category).toBe(PredictionCategory.HIGH_RECOMMENDATION);
    expect(r.active.confidence).toBeGreaterThanOrEqual(0.7);
    expect(r.active.confidence).toBeLessThanOrEqual(0.75);
  });
});

describe('decision — SKIP paths', () => {
  it('low agreement SKIP (below 58% weighted agreement)', () => {
    const r = decide(
      [mr('streak', P, 1, 0.5), mr('distribution', P, 0.2, 0.4), mr('chop', B, 1, 0.5)],
      ctx(),
    );
    expect(r.weightedAgreement).toBeLessThan(0.58);
    expect(r.rawCategory).toBe(PredictionCategory.BELOW_THRESHOLD);
    expect(r.active.decision).toBe(PredictionDecision.SKIP);
    expect(r.active.reasonCodes).toContain(DecisionReason.BELOW_MIN_AGREEMENT);
  });

  it('strong opposition SKIP (would bet, but opposition >= 40%)', () => {
    const r = decide(
      [mr('streak', P, 1, 0.5), mr('distribution', P, 0.45, 0.4), mr('chop', B, 0.82, 0.5)],
      ctx(),
    );
    expect(r.weightedAgreement).toBeGreaterThanOrEqual(0.58); // passes agreement gate
    expect(r.rawCategory).toBe(PredictionCategory.EXPERIMENTAL); // would have been a bet
    expect(r.conflictScore).toBeGreaterThanOrEqual(0.4);
    expect(r.active.riskFlags).toContain(DecisionRiskFlag.STRONG_OPPOSITION);
    expect(r.active.decision).toBe(PredictionDecision.SKIP);
    expect(r.active.riskLevel).toBe(RiskLevel.HIGH);
    expect(r.active.reasonCodes).toContain(DecisionReason.STRONG_OPPOSITION_SKIP);
  });

  it('multiple soft risks SKIP (>= 3 soft flags)', () => {
    const r = decide(
      [mr('streak', P, 1, 0.5), mr('chop', P, 1, 0.5)],
      ctx({
        regimeTransitioning: true,
        nonTieCount: 8,
        dataQuality: {
          warmupMet: true,
          winnerCompleteness: 1,
          pairCompleteness: 0,
          revisions: 0,
          missingRounds: 0,
        },
      }),
    );
    expect(r.rawCategory).toBe(PredictionCategory.QUALIFIED); // strong absent risk => bet
    expect(r.active.decision).toBe(PredictionDecision.SKIP);
    expect(r.active.riskLevel).toBe(RiskLevel.HIGH);
    expect(r.active.reasonCodes).toContain(DecisionReason.MULTIPLE_RISK_SKIP);
    expect(r.active.riskFlags).toEqual(
      expect.arrayContaining([
        DecisionRiskFlag.LOW_MODULE_COUNT,
        DecisionRiskFlag.REGIME_TRANSITION,
        DecisionRiskFlag.MEDIUM_DATA_QUALITY,
        DecisionRiskFlag.LOW_SAMPLE_RELIABILITY,
      ]),
    );
  });

  it('data-quality BLOCK forces SKIP even with strong votes', () => {
    const strong = [
      mr('streak', B, 1, 0.5),
      mr('distribution', B, 1, 0.4),
      mr('run-length', B, 1, 0.45),
      mr('chop', B, 1, 0.5),
    ];
    const r = decide(
      strong,
      ctx({
        nonTieCount: 5,
        dataQuality: {
          warmupMet: false,
          winnerCompleteness: 1,
          pairCompleteness: 1,
          revisions: 0,
          missingRounds: 0,
        },
      }),
    );
    expect(r.dataQualityLevel).toBe(DataQualityLevel.BLOCK);
    expect(r.rawCategory).toBe(PredictionCategory.HIGH_RECOMMENDATION);
    expect(r.active.decision).toBe(PredictionDecision.SKIP);
    expect(r.active.category).toBe(PredictionCategory.BELOW_THRESHOLD);
    expect(r.active.riskLevel).toBe(RiskLevel.CRITICAL);
    expect(r.active.reasonCodes).toContain(DecisionReason.DATA_QUALITY_BLOCK);
  });
});

describe('decision — risk adjustments', () => {
  it('category downgrade (HIGH -> QUALIFIED on two soft risks)', () => {
    const r = decide(
      [
        mr('streak', B, 1, 0.5),
        mr('distribution', B, 1, 0.4),
        mr('run-length', B, 1, 0.45),
        mr('chop', B, 1, 0.5),
      ],
      ctx({ regimeTransitioning: true, nonTieCount: 8 }),
    );
    expect(r.rawCategory).toBe(PredictionCategory.HIGH_RECOMMENDATION);
    expect(r.active.category).toBe(PredictionCategory.QUALIFIED);
    expect(r.active.confidence).toBe(0.69); // capped, never increased
    expect(r.active.confidence).toBeLessThan(r.rawConfidence);
    expect(r.active.decision).toBe(PredictionDecision.BET_BANKER);
    expect(r.active.riskLevel).toBe(RiskLevel.MEDIUM);
    expect(r.active.reasonCodes).toContain(DecisionReason.CATEGORY_DOWNGRADED);
  });

  it('family correlation cap limits correlated Trend evidence', () => {
    const r = decide(
      [mr('streak', P, 1, 0.5), mr('run-length', P, 1, 0.5), mr('distribution', P, 1, 0.5)],
      ctx(),
    );
    // Naive sum would be 1.5; capped discounted sum = 0.5 + 0.25 + 0.125 = 0.875.
    expect(trendFamily(r)?.player).toBe(0.875);
    expect(r.playerScore).toBe(0.875);
    expect(r.playerScore).toBeLessThan(1.5);
    expect(r.directionalModuleCount).toBe(3);
  });

  it('active vs shadow volatility (shadow may downgrade; active unaffected)', () => {
    const r = decide(
      [mr('streak', P, 1, 0.5), mr('chop', P, 1, 0.5)],
      ctx({ recentPatternBreaks: 3 }),
    );
    // Active: 1 soft flag (LOW_MODULE_COUNT) => retain QUALIFIED bet.
    expect(r.active.category).toBe(PredictionCategory.QUALIFIED);
    expect(r.active.decision).toBe(PredictionDecision.BET_PLAYER);
    expect(r.active.riskFlags).not.toContain(DecisionRiskFlag.RECENT_PATTERN_BREAK);
    // Shadow: adds RECENT_PATTERN_BREAK => 2 soft flags => downgrade.
    expect(r.shadow.riskFlags).toContain(DecisionRiskFlag.RECENT_PATTERN_BREAK);
    expect(r.shadow.category).toBe(PredictionCategory.EXPERIMENTAL);
    expect(r.shadow.decision).toBe(PredictionDecision.BET_PLAYER);
    expect(r.shadow.reasonCodes).toContain(DecisionReason.SHADOW_VOLATILITY_DOWNGRADE);
  });

  it('confidence never exceeds 75%', () => {
    const r = decide(
      [
        mr('streak', B, 1, 1),
        mr('run-length', B, 1, 1),
        mr('distribution', B, 1, 1),
        mr('chop', B, 1, 1),
      ],
      ctx(),
    );
    expect(r.rawConfidence).toBe(0.75);
    expect(r.active.confidence).toBeLessThanOrEqual(0.75);
    expect(r.active.category).toBe(PredictionCategory.HIGH_RECOMMENDATION);
  });

  it('risk filter never reverses the winning side', () => {
    // Player wins but banker opposes strongly -> must be SKIP, never BET_BANKER.
    const opp = decide(
      [mr('streak', P, 1, 0.5), mr('distribution', P, 0.45, 0.4), mr('chop', B, 0.82, 0.5)],
      ctx(),
    );
    expect(opp.active.decision).not.toBe(PredictionDecision.BET_BANKER);
    expect(opp.active.side).not.toBe(VoteSide.BANKER);

    // Across several outcomes: side is winner or null; category/confidence never raised.
    const cases = [
      decide([mr('streak', P, 0.4, 0.5), mr('chop', P, 0.5, 0.5)], ctx()),
      decide([mr('streak', B, 1, 0.5), mr('chop', B, 1, 0.5)], ctx({ regimeTransitioning: true, nonTieCount: 8 })),
      opp,
    ];
    for (const r of cases) {
      const winner =
        r.playerScore > r.bankerScore
          ? VoteSide.PLAYER
          : r.bankerScore > r.playerScore
            ? VoteSide.BANKER
            : null;
      if (r.active.decision === PredictionDecision.BET_PLAYER) {
        expect(winner).toBe(VoteSide.PLAYER);
      }
      if (r.active.decision === PredictionDecision.BET_BANKER) {
        expect(winner).toBe(VoteSide.BANKER);
      }
      // side is always the winner or null (never the opposite)
      expect([winner, null]).toContain(r.active.side);
      expect(r.active.confidence).toBeLessThanOrEqual(r.rawConfidence + 1e-9);
    }
  });
});

describe('decision — versions & determinism', () => {
  it('records the locked engine versions', () => {
    const r = decide([mr('streak', P, 0.8, 0.5), mr('chop', P, 0.6, 0.5)], ctx());
    expect(r.votingVersion).toBe('VOTE-001');
    expect(r.confidenceVersion).toBe('CONF-001');
    expect(r.riskVersion).toBe('RISK-001');
    expect(r.engineVersion).toBe('ENGINE-001');
    expect(r.configVersion).toBe('CFG-001');
    expect(r.decisionConfigVersion).toBe('DECISION-001');
  });

  it('is deterministic for identical inputs', () => {
    const vec = [mr('streak', B, 0.8, 0.5), mr('distribution', B, 0.7, 0.4), mr('chop', B, 0.6, 0.5)];
    expect(decide(vec, ctx())).toEqual(decide(vec.slice(), ctx()));
  });
});

// ---------------------------------------------------------------------------
describe('decision — integration via runDecisionPipeline', () => {
  function makeRound(n: number, w: Winner): RoundRecord {
    return {
      id: `sh-${n}`,
      shoeId: 'sh',
      roundNumber: n,
      winner: w,
      playerPair: PairState.NO,
      bankerPair: PairState.NO,
      source: RoundSource.HISTORY,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
  }
  const rounds = Array.from({ length: 12 }, (_, i) => makeRound(i + 1, Winner.BANKER));
  const analysisCtx = {
    snapshot: buildShoeStateSnapshot(rounds, { historyConfirmed: true }),
    features: extractFeatures(rounds, { historyConfirmed: true }),
  };

  it('produces a directional banker draft for a strong banker shoe', () => {
    const r = runDecisionPipeline(analysisCtx);
    expect(r.dataQualityLevel).toBe(DataQualityLevel.PASS);
    expect(r.active.decision).toBe(PredictionDecision.BET_BANKER);
    expect(r.draft.isDraft).toBe(true);
    expect(r.draft.decision).toBe(r.active.decision);
    expect(r.active.confidence).toBeLessThanOrEqual(0.75);
  });

  it('is deterministic end-to-end', () => {
    expect(runDecisionPipeline(analysisCtx)).toEqual(runDecisionPipeline(analysisCtx));
  });
});
