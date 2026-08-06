/**
 * PART B — Deterministic feature extraction.
 *
 * Features are derived numeric/categorical signals computed purely from the raw
 * rounds (+ roadmap) available before the target round. No randomness, no ML, no
 * I/O. Identical rounds always yield identical features.
 */
import { VERSION_REGISTRY } from '../../config/versions';
import { Winner } from '../models/outcome';
import { PairState } from '../models/pair';
import type { RoundRecord } from '../models/round';
import { buildRoadmap } from '../roadmap/engine';
import type { RoadmapResult } from '../roadmap/types';
import { DerivedMark } from '../roadmap/types';
import {
  Side,
  alternationRate,
  currentAlternationRun,
  deepFreeze,
  lastN,
  longestAlternationRun,
  nonTieWinners,
  ratio,
  round6,
  toRuns,
  variance,
} from '../analysis/helpers';

export const FEATURE_VERSION = VERSION_REGISTRY.feature; // FEATURE-001

/** Minimum non-Tie results for a regime to be classified (else NEUTRAL). */
export const REGIME_MIN_NON_TIE = 4;

export enum Regime {
  STREAKY = 'STREAKY',
  CHOPPY = 'CHOPPY',
  MIXED = 'MIXED',
  NEUTRAL = 'NEUTRAL',
}

export enum TransitionState {
  STABLE = 'STABLE',
  TRANSITIONING = 'TRANSITIONING',
}

export interface DistributionRatios {
  readonly playerRatio: number;
  readonly bankerRatio: number;
}

export interface DistributionFeatures {
  readonly playerRatio: number;
  readonly bankerRatio: number;
  readonly tieRatio: number;
  readonly byWindow: {
    readonly last5: DistributionRatios;
    readonly last8: DistributionRatios;
    readonly last12: DistributionRatios;
    readonly full: DistributionRatios;
  };
}

export interface StreakFeatures {
  readonly currentSide: Side | null;
  readonly currentStreak: number;
  readonly previousRun: number;
  readonly maxRun: number;
  readonly averageRunLength: number;
  readonly runLengthDistribution: Readonly<Record<number, number>>;
}

export interface ChopFeatures {
  readonly alternationRate: number;
  readonly currentAlternationRun: number;
  readonly longestAlternationRun: number;
  readonly singleColumnRatio: number;
}

export interface BigRoadFeatures {
  readonly currentColumn: number;
  readonly currentRow: number;
  readonly currentColumnHeight: number;
  readonly recentColumnHeights: readonly number[];
  readonly dragonTail: boolean;
}

export interface DerivedRoadFeatures {
  readonly latestColor: DerivedMark | null;
  readonly currentRun: number;
  readonly available: boolean;
}

export interface DerivedRoadsFeatures {
  readonly bigEyeBoy: DerivedRoadFeatures;
  readonly smallRoad: DerivedRoadFeatures;
  readonly cockroachPig: DerivedRoadFeatures;
  readonly agreement: boolean; // all available roads share the latest color
}

export interface RegimeFeatures {
  readonly currentRegime: Regime;
  readonly previousRegime: Regime;
  readonly transitionState: TransitionState;
  readonly transitionAge: number;
}

export interface VolatilityFeatures {
  readonly windowDisagreement: number;
  readonly regimeChanges: number;
  readonly runLengthVariance: number;
  readonly recentPatternBreaks: number;
  readonly stabilityScore: number; // 0..1 (higher = more stable)
  readonly volatilityScore: number; // 0..1 (higher = more volatile)
}

export interface DataQualityFeatures {
  readonly winnerCompleteness: number;
  readonly pairCompleteness: number;
  readonly revisions: number;
  readonly missingRounds: number;
  readonly historyConfirmed: boolean;
}

export interface FeatureSet {
  readonly featureVersion: string;
  readonly nonTieCount: number;
  readonly distribution: DistributionFeatures;
  readonly streak: StreakFeatures;
  readonly chop: ChopFeatures;
  readonly bigRoad: BigRoadFeatures;
  readonly derivedRoads: DerivedRoadsFeatures;
  readonly regime: RegimeFeatures;
  readonly volatility: VolatilityFeatures;
  readonly dataQuality: DataQualityFeatures;
}

export interface FeatureOptions {
  readonly roadmap?: RoadmapResult;
  readonly revisionCount?: number;
  readonly historyConfirmed?: boolean;
}

const sideRatios = (sides: readonly Side[]): DistributionRatios => {
  const p = sides.filter((s) => s === Winner.PLAYER).length;
  return {
    playerRatio: round6(ratio(p, sides.length)),
    bankerRatio: round6(ratio(sides.length - p, sides.length)),
  };
};

export function classifyRegime(sides: readonly Side[]): Regime {
  if (sides.length < REGIME_MIN_NON_TIE) return Regime.NEUTRAL;
  const alt = alternationRate(sides);
  if (alt >= 0.6) return Regime.CHOPPY;
  if (alt <= 0.35) return Regime.STREAKY;
  return Regime.MIXED;
}

function derivedFeature(
  cells: readonly { readonly mark: DerivedMark }[],
): DerivedRoadFeatures {
  if (cells.length === 0) {
    return { latestColor: null, currentRun: 0, available: false };
  }
  const latestColor = cells[cells.length - 1].mark;
  let run = 0;
  for (let i = cells.length - 1; i >= 0; i -= 1) {
    if (cells[i].mark === latestColor) run += 1;
    else break;
  }
  return { latestColor, currentRun: run, available: true };
}

function countRegimeChanges(sides: readonly Side[]): number {
  if (sides.length < REGIME_MIN_NON_TIE + 1) return 0;
  let changes = 0;
  let prev = classifyRegime(sides.slice(0, REGIME_MIN_NON_TIE));
  for (let i = REGIME_MIN_NON_TIE + 1; i <= sides.length; i += 1) {
    const cur = classifyRegime(lastN(sides.slice(0, i), 6));
    if (cur !== prev && cur !== Regime.NEUTRAL) {
      changes += 1;
      prev = cur;
    }
  }
  return changes;
}

function recentPatternBreaks(sides: readonly Side[]): number {
  const window = lastN(sides, 8);
  let breaks = 0;
  let run = 1;
  for (let i = 1; i < window.length; i += 1) {
    if (window[i] === window[i - 1]) {
      run += 1;
    } else {
      if (run >= 2) breaks += 1;
      run = 1;
    }
  }
  return breaks;
}

/** Extract the full, deterministic feature set from the prior rounds. */
export function extractFeatures(
  rounds: readonly RoundRecord[],
  options: FeatureOptions = {},
): FeatureSet {
  const roadmap = options.roadmap ?? buildRoadmap(rounds.slice());
  const sides = nonTieWinners(rounds);
  const runs = toRuns(sides);

  const playerCount = sides.filter((s) => s === Winner.PLAYER).length;
  const bankerCount = sides.length - playerCount;
  const tieCount = rounds.filter((r) => r.winner === Winner.TIE).length;

  // Distribution ---------------------------------------------------------
  const distribution: DistributionFeatures = {
    playerRatio: round6(ratio(playerCount, sides.length)),
    bankerRatio: round6(ratio(bankerCount, sides.length)),
    tieRatio: round6(ratio(tieCount, rounds.length)),
    byWindow: {
      last5: sideRatios(lastN(sides, 5)),
      last8: sideRatios(lastN(sides, 8)),
      last12: sideRatios(lastN(sides, 12)),
      full: sideRatios(sides),
    },
  };

  // Streak ---------------------------------------------------------------
  const runLengths = runs.map((r) => r.length);
  const runLengthDistribution: Record<number, number> = {};
  for (const len of runLengths) {
    runLengthDistribution[len] = (runLengthDistribution[len] ?? 0) + 1;
  }
  const current = runs[runs.length - 1] ?? null;
  const previous = runs.length >= 2 ? runs[runs.length - 2] : null;
  const streak: StreakFeatures = {
    currentSide: current?.side ?? null,
    currentStreak: current?.length ?? 0,
    previousRun: previous?.length ?? 0,
    maxRun: runLengths.length ? Math.max(...runLengths) : 0,
    averageRunLength: round6(
      runLengths.length ? runLengths.reduce((s, v) => s + v, 0) / runLengths.length : 0,
    ),
    runLengthDistribution,
  };

  // Chop -----------------------------------------------------------------
  const singleColumns = runs.filter((r) => r.length === 1).length;
  const chop: ChopFeatures = {
    alternationRate: round6(alternationRate(sides)),
    currentAlternationRun: currentAlternationRun(sides),
    longestAlternationRun: longestAlternationRun(sides),
    singleColumnRatio: round6(ratio(singleColumns, runs.length)),
  };

  // Big Road -------------------------------------------------------------
  const currentColumnHeight = current?.length ?? 0;
  const bigRoad: BigRoadFeatures = {
    currentColumn: runs.length - 1,
    currentRow: currentColumnHeight === 0 ? -1 : Math.min(currentColumnHeight, 6) - 1,
    currentColumnHeight,
    recentColumnHeights: lastN(runLengths, 6),
    dragonTail: currentColumnHeight > 6,
  };

  // Derived roads --------------------------------------------------------
  const bigEyeBoy = derivedFeature(roadmap.bigEyeBoy);
  const smallRoad = derivedFeature(roadmap.smallRoad);
  const cockroachPig = derivedFeature(roadmap.cockroachPig);
  const availableColors = [bigEyeBoy, smallRoad, cockroachPig]
    .filter((d) => d.available)
    .map((d) => d.latestColor);
  const derivedRoads: DerivedRoadsFeatures = {
    bigEyeBoy,
    smallRoad,
    cockroachPig,
    agreement:
      availableColors.length > 0 &&
      availableColors.every((c) => c === availableColors[0]),
  };

  // Regime & transition --------------------------------------------------
  const currentRegime = classifyRegime(lastN(sides, 12));
  const previousRegime = classifyRegime(lastN(sides.slice(0, Math.max(0, sides.length - 3)), 12));
  const transitionState =
    currentRegime !== previousRegime && currentRegime !== Regime.NEUTRAL
      ? TransitionState.TRANSITIONING
      : TransitionState.STABLE;
  const transitionAge =
    currentRegime === Regime.STREAKY
      ? streak.currentStreak
      : currentRegime === Regime.CHOPPY
        ? chop.currentAlternationRun
        : 0;
  const regime: RegimeFeatures = {
    currentRegime,
    previousRegime,
    transitionState,
    transitionAge,
  };

  // Volatility -----------------------------------------------------------
  const winRatios = [
    distribution.byWindow.last5.playerRatio,
    distribution.byWindow.last8.playerRatio,
    distribution.byWindow.last12.playerRatio,
    distribution.byWindow.full.playerRatio,
  ];
  const windowDisagreement = round6(Math.max(...winRatios) - Math.min(...winRatios));
  const runLengthVar = round6(variance(runLengths));
  const regimeChanges = countRegimeChanges(sides);
  const breaks = recentPatternBreaks(sides);
  // Bounded 0..1 volatility score: blend disagreement, normalized run-length
  // variance, and normalized regime changes.
  const volatilityScore = round6(
    Math.min(
      1,
      0.5 * windowDisagreement +
        0.3 * Math.min(1, runLengthVar / 4) +
        0.2 * Math.min(1, regimeChanges / 3),
    ),
  );
  const volatility: VolatilityFeatures = {
    windowDisagreement,
    regimeChanges,
    runLengthVariance: runLengthVar,
    recentPatternBreaks: breaks,
    stabilityScore: round6(1 - volatilityScore),
    volatilityScore,
  };

  // Data quality ---------------------------------------------------------
  const pairsKnown = rounds.filter(
    (r) => r.playerPair !== PairState.UNKNOWN && r.bankerPair !== PairState.UNKNOWN,
  ).length;
  const dataQuality: DataQualityFeatures = {
    winnerCompleteness: 1,
    pairCompleteness: round6(rounds.length === 0 ? 1 : pairsKnown / rounds.length),
    revisions: options.revisionCount ?? 0,
    missingRounds: 0,
    historyConfirmed: options.historyConfirmed ?? false,
  };

  return deepFreeze({
    featureVersion: FEATURE_VERSION,
    nonTieCount: sides.length,
    distribution,
    streak,
    chop,
    bigRoad,
    derivedRoads,
    regime,
    volatility,
    dataQuality,
  });
}
