/**
 * PART C — The analysis modules. All pure and deterministic: no randomness, no
 * ML, no network, no balances, no prior financial outcomes, no target-sequence
 * progress. Every non-guard analyzer ABSTAINs before the 8 non-Tie warm-up.
 */
import { MIN_WARMUP_NON_TIE } from '../../config/engine';
import { ModuleStatus } from '../models/enums';
import { Winner } from '../models/outcome';
import {
  Regime,
  TransitionState,
  type FeatureSet,
} from '../features/feature-extraction';
import { opposite, round6, type Side } from './helpers';
import {
  ANALYZER_VERSIONS,
  AnalysisContext,
  AnalysisModule,
  AnalysisSignal,
  ModuleAnalysis,
  ReasonCode,
  RiskFlag,
  clamp01,
  reliabilityPrior,
} from './types';

const sideToSignal = (side: Side): AnalysisSignal =>
  side === Winner.PLAYER ? AnalysisSignal.PLAYER : AnalysisSignal.BANKER;

// NOTE (Milestone-3 reliability correction):
// `reliability` is a deterministic, versioned, UNCALIBRATED MVP PRIOR assigned
// to each analyzer itself (see RELIABILITY_PRIORS in ./types). It MUST NOT
// encode any current-shoe condition (non-Tie count, stability/volatility,
// streak, regime, distribution, shoe position, results, sequence state). All
// current-shoe evidence stays in `strength`; regime/volatility/data-quality live
// in their own layers (Milestone-4 context/risk and the Data Quality Guard).

const commonRiskFlags = (f: FeatureSet): RiskFlag[] => {
  const flags: RiskFlag[] = [];
  if (f.nonTieCount < MIN_WARMUP_NON_TIE) flags.push(RiskFlag.INSUFFICIENT_WARMUP);
  if (f.dataQuality.revisions > 0) flags.push(RiskFlag.REVISIONS_PRESENT);
  if (!f.dataQuality.historyConfirmed) flags.push(RiskFlag.HISTORY_UNCONFIRMED);
  if (f.volatility.volatilityScore >= 0.6) flags.push(RiskFlag.HIGH_VOLATILITY);
  if (f.regime.transitionState === TransitionState.TRANSITIONING) {
    flags.push(RiskFlag.IN_TRANSITION);
  }
  return flags;
};

const abstain = (
  moduleId: string,
  version: string,
  status: ModuleStatus,
  reasonCodes: ReasonCode[],
  riskFlags: RiskFlag[],
): ModuleAnalysis => ({
  moduleId,
  signal: AnalysisSignal.ABSTAIN,
  strength: 0,
  reliability: 0,
  status,
  reasonCodes,
  riskFlags,
  version,
});

/** True when the warm-up requirement is not yet met. */
const belowWarmup = (f: FeatureSet): boolean => f.nonTieCount < MIN_WARMUP_NON_TIE;

// ---------------------------------------------------------------------------
// 1. Streak Analyzer (ACTIVE) — follow a strong current streak.
// ---------------------------------------------------------------------------
export const streakAnalyzer: AnalysisModule = {
  id: 'streak',
  version: ANALYZER_VERSIONS.streak,
  status: ModuleStatus.ACTIVE,
  analyze({ features }: AnalysisContext): ModuleAnalysis {
    const f = features;
    if (belowWarmup(f)) {
      return abstain(this.id, this.version, this.status, [ReasonCode.INSUFFICIENT_DATA], commonRiskFlags(f));
    }
    const { currentSide, currentStreak } = f.streak;
    const reliability = reliabilityPrior(this.id);
    if (currentSide && currentStreak >= 3) {
      return {
        moduleId: this.id,
        signal: sideToSignal(currentSide),
        strength: round6(clamp01((currentStreak - 2) / 4)),
        reliability,
        status: this.status,
        reasonCodes: [ReasonCode.STRONG_STREAK],
        riskFlags: commonRiskFlags(f),
        version: this.version,
      };
    }
    return {
      moduleId: this.id,
      signal: AnalysisSignal.NEUTRAL,
      strength: 0,
      reliability,
      status: this.status,
      reasonCodes: [ReasonCode.WEAK_STREAK],
      riskFlags: commonRiskFlags(f),
      version: this.version,
    };
  },
};

// ---------------------------------------------------------------------------
// 2. Chop Analyzer (ACTIVE) — continue a strong alternation.
// ---------------------------------------------------------------------------
export const chopAnalyzer: AnalysisModule = {
  id: 'chop',
  version: ANALYZER_VERSIONS.chop,
  status: ModuleStatus.ACTIVE,
  analyze({ features }: AnalysisContext): ModuleAnalysis {
    const f = features;
    if (belowWarmup(f)) {
      return abstain(this.id, this.version, this.status, [ReasonCode.INSUFFICIENT_DATA], commonRiskFlags(f));
    }
    const reliability = reliabilityPrior(this.id);
    const { currentSide } = f.streak;
    if (currentSide && f.chop.alternationRate >= 0.6 && f.chop.currentAlternationRun >= 3) {
      return {
        moduleId: this.id,
        signal: sideToSignal(opposite(currentSide)),
        strength: round6(clamp01(f.chop.alternationRate)),
        reliability,
        status: this.status,
        reasonCodes: [ReasonCode.HIGH_ALTERNATION],
        riskFlags: commonRiskFlags(f),
        version: this.version,
      };
    }
    return {
      moduleId: this.id,
      signal: AnalysisSignal.NEUTRAL,
      strength: 0,
      reliability,
      status: this.status,
      reasonCodes: [ReasonCode.LOW_ALTERNATION],
      riskFlags: commonRiskFlags(f),
      version: this.version,
    };
  },
};

// ---------------------------------------------------------------------------
// 3. Run-Length Analyzer (ACTIVE) — continuation vs break vs typical run.
// ---------------------------------------------------------------------------
export const runLengthAnalyzer: AnalysisModule = {
  id: 'run-length',
  version: ANALYZER_VERSIONS['run-length'],
  status: ModuleStatus.ACTIVE,
  analyze({ features }: AnalysisContext): ModuleAnalysis {
    const f = features;
    if (belowWarmup(f) || f.bigRoad.currentColumn < 2) {
      return abstain(this.id, this.version, this.status, [ReasonCode.INSUFFICIENT_DATA], commonRiskFlags(f));
    }
    const reliability = reliabilityPrior(this.id);
    const { currentSide, currentStreak, averageRunLength } = f.streak;
    const diff = currentStreak - averageRunLength;
    if (currentSide && diff <= -0.5) {
      return {
        moduleId: this.id,
        signal: sideToSignal(currentSide),
        strength: round6(clamp01(Math.abs(diff) / Math.max(averageRunLength, 1))),
        reliability,
        status: this.status,
        reasonCodes: [ReasonCode.EXPECT_CONTINUATION],
        riskFlags: commonRiskFlags(f),
        version: this.version,
      };
    }
    if (currentSide && diff >= 0.5) {
      return {
        moduleId: this.id,
        signal: sideToSignal(opposite(currentSide)),
        strength: round6(clamp01(Math.abs(diff) / Math.max(averageRunLength, 1))),
        reliability,
        status: this.status,
        reasonCodes: [ReasonCode.EXPECT_BREAK],
        riskFlags: commonRiskFlags(f),
        version: this.version,
      };
    }
    return {
      moduleId: this.id,
      signal: AnalysisSignal.NEUTRAL,
      strength: 0,
      reliability,
      status: this.status,
      reasonCodes: [ReasonCode.WEAK_STREAK],
      riskFlags: commonRiskFlags(f),
      version: this.version,
    };
  },
};

// ---------------------------------------------------------------------------
// 4. Distribution Analyzer (ACTIVE) — lean toward the skewed side.
// ---------------------------------------------------------------------------
export const distributionAnalyzer: AnalysisModule = {
  id: 'distribution',
  version: ANALYZER_VERSIONS.distribution,
  status: ModuleStatus.ACTIVE,
  analyze({ features }: AnalysisContext): ModuleAnalysis {
    const f = features;
    if (belowWarmup(f)) {
      return abstain(this.id, this.version, this.status, [ReasonCode.INSUFFICIENT_DATA], commonRiskFlags(f));
    }
    const reliability = reliabilityPrior(this.id);
    const skew = f.distribution.playerRatio - 0.5;
    if (Math.abs(skew) >= 0.1) {
      return {
        moduleId: this.id,
        signal: skew > 0 ? AnalysisSignal.PLAYER : AnalysisSignal.BANKER,
        strength: round6(clamp01(Math.abs(skew) * 4)),
        reliability,
        status: this.status,
        reasonCodes: [ReasonCode.DISTRIBUTION_SKEW],
        riskFlags: commonRiskFlags(f),
        version: this.version,
      };
    }
    return {
      moduleId: this.id,
      signal: AnalysisSignal.NEUTRAL,
      strength: 0,
      reliability,
      status: this.status,
      reasonCodes: [ReasonCode.BALANCED_DISTRIBUTION],
      riskFlags: commonRiskFlags(f),
      version: this.version,
    };
  },
};

// ---------------------------------------------------------------------------
// 5. Regime & Transition Analyzer (ACTIVE).
// ---------------------------------------------------------------------------
export const regimeTransitionAnalyzer: AnalysisModule = {
  id: 'regime-transition',
  version: ANALYZER_VERSIONS['regime-transition'],
  status: ModuleStatus.ACTIVE,
  analyze({ features }: AnalysisContext): ModuleAnalysis {
    const f = features;
    if (belowWarmup(f)) {
      return abstain(this.id, this.version, this.status, [ReasonCode.INSUFFICIENT_DATA], commonRiskFlags(f));
    }
    const reliability = reliabilityPrior(this.id);
    const risks = commonRiskFlags(f);
    const { currentSide } = f.streak;
    if (f.regime.transitionState === TransitionState.TRANSITIONING) {
      return {
        moduleId: this.id,
        signal: AnalysisSignal.NEUTRAL,
        strength: 0,
        reliability,
        status: this.status,
        reasonCodes: [ReasonCode.IN_TRANSITION],
        riskFlags: risks,
        version: this.version,
      };
    }
    if (currentSide && f.regime.currentRegime === Regime.STREAKY) {
      return {
        moduleId: this.id,
        signal: sideToSignal(currentSide),
        strength: round6(clamp01(f.regime.transitionAge / 5)),
        reliability,
        status: this.status,
        reasonCodes: [ReasonCode.REGIME_STREAKY],
        riskFlags: risks,
        version: this.version,
      };
    }
    if (currentSide && f.regime.currentRegime === Regime.CHOPPY) {
      return {
        moduleId: this.id,
        signal: sideToSignal(opposite(currentSide)),
        strength: round6(clamp01(f.regime.transitionAge / 5)),
        reliability,
        status: this.status,
        reasonCodes: [ReasonCode.REGIME_CHOPPY],
        riskFlags: risks,
        version: this.version,
      };
    }
    return {
      moduleId: this.id,
      signal: AnalysisSignal.NEUTRAL,
      strength: 0,
      reliability,
      status: this.status,
      reasonCodes: [ReasonCode.REGIME_MIXED],
      riskFlags: risks,
      version: this.version,
    };
  },
};

// ---------------------------------------------------------------------------
// 6. Data Quality Guard (ACTIVE) — never a side; reports quality + risk flags.
// ---------------------------------------------------------------------------
export const dataQualityGuard: AnalysisModule = {
  id: 'data-quality-guard',
  version: ANALYZER_VERSIONS['data-quality-guard'],
  status: ModuleStatus.ACTIVE,
  analyze({ features }: AnalysisContext): ModuleAnalysis {
    const f = features;
    const risks = commonRiskFlags(f);
    if (f.dataQuality.pairCompleteness < 0.5) risks.push(RiskFlag.LOW_PAIR_COMPLETENESS);
    const quality = round6(
      clamp01(
        f.dataQuality.winnerCompleteness * (0.5 + 0.5 * f.dataQuality.pairCompleteness),
      ),
    );
    return {
      moduleId: this.id,
      signal: AnalysisSignal.NEUTRAL,
      strength: quality,
      reliability: reliabilityPrior(this.id),
      status: this.status,
      reasonCodes: [ReasonCode.DATA_QUALITY_OK],
      riskFlags: risks,
      version: this.version,
    };
  },
};

// ---------------------------------------------------------------------------
// 7. Volatility Analyzer (SHADOW_ONLY) — computed/logged, never influential.
// ---------------------------------------------------------------------------
export const volatilityAnalyzer: AnalysisModule = {
  id: 'volatility',
  version: ANALYZER_VERSIONS.volatility,
  status: ModuleStatus.SHADOW_ONLY,
  analyze({ features }: AnalysisContext): ModuleAnalysis {
    const f = features;
    if (belowWarmup(f)) {
      return abstain(this.id, this.version, this.status, [ReasonCode.INSUFFICIENT_DATA, ReasonCode.SHADOW_ONLY], commonRiskFlags(f));
    }
    const risks = commonRiskFlags(f);
    return {
      moduleId: this.id,
      signal: AnalysisSignal.NEUTRAL,
      strength: f.volatility.volatilityScore,
      reliability: reliabilityPrior(this.id),
      status: this.status,
      reasonCodes: [ReasonCode.SHADOW_ONLY],
      riskFlags: risks,
      version: this.version,
    };
  },
};

// ---------------------------------------------------------------------------
// 8. Derived Road Analyzer (SHADOW_ONLY) — structural agreement (shadow).
// ---------------------------------------------------------------------------
export const derivedRoadAnalyzer: AnalysisModule = {
  id: 'derived-road',
  version: ANALYZER_VERSIONS['derived-road'],
  status: ModuleStatus.SHADOW_ONLY,
  analyze({ features }: AnalysisContext): ModuleAnalysis {
    const f = features;
    if (belowWarmup(f) || !f.derivedRoads.bigEyeBoy.available) {
      return abstain(
        this.id,
        this.version,
        this.status,
        [ReasonCode.INSUFFICIENT_DATA, ReasonCode.SHADOW_ONLY],
        [...commonRiskFlags(f), RiskFlag.DERIVED_UNAVAILABLE],
      );
    }
    const { currentSide } = f.streak;
    const risks = commonRiskFlags(f);
    if (currentSide && f.derivedRoads.agreement) {
      return {
        moduleId: this.id,
        signal: sideToSignal(currentSide),
        strength: round6(clamp01(f.derivedRoads.bigEyeBoy.currentRun / 4)),
        reliability: reliabilityPrior(this.id),
        status: this.status,
        reasonCodes: [ReasonCode.DERIVED_AGREEMENT, ReasonCode.SHADOW_ONLY],
        riskFlags: risks,
        version: this.version,
      };
    }
    return {
      moduleId: this.id,
      signal: AnalysisSignal.NEUTRAL,
      strength: 0,
      reliability: reliabilityPrior(this.id),
      status: this.status,
      reasonCodes: [ReasonCode.DERIVED_DISAGREEMENT, ReasonCode.SHADOW_ONLY],
      riskFlags: risks,
      version: this.version,
    };
  },
};

// ---------------------------------------------------------------------------
// 9. Historical Matcher (DISABLED) — interface only; never computed by the
//    runner. Present for completeness; analyze always ABSTAINs.
// ---------------------------------------------------------------------------
export const historicalMatcher: AnalysisModule = {
  id: 'historical-matcher',
  version: ANALYZER_VERSIONS['historical-matcher'],
  status: ModuleStatus.DISABLED,
  analyze(): ModuleAnalysis {
    return {
      moduleId: this.id,
      signal: AnalysisSignal.ABSTAIN,
      strength: 0,
      reliability: 0,
      status: ModuleStatus.DISABLED,
      reasonCodes: [ReasonCode.MODULE_DISABLED],
      riskFlags: [],
      version: this.version,
    };
  },
};

/** All modules in registry order (Historical Matcher last, DISABLED). */
export const ALL_MODULES: readonly AnalysisModule[] = Object.freeze([
  streakAnalyzer,
  chopAnalyzer,
  runLengthAnalyzer,
  distributionAnalyzer,
  regimeTransitionAnalyzer,
  dataQualityGuard,
  volatilityAnalyzer,
  derivedRoadAnalyzer,
  historicalMatcher,
]);
