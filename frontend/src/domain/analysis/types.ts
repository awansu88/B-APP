/**
 * PART C — Shared analysis-module interface (pure, deterministic).
 *
 * Every module consumes an immutable snapshot + feature set and returns a
 * uniform result. Modules never use randomness, ML, network, balances, prior
 * financial outcomes, or target-sequence progress. Modules ABSTAIN when their
 * activation requirements are not met.
 */
import { ModuleStatus } from '../models/enums';
import type { FeatureSet } from '../features/feature-extraction';
import type { ShoeStateSnapshot } from '../snapshot/shoe-snapshot';

/** Directional signal. Distinct from the internal `ModuleSignal` enum: analysis
 * modules may explicitly ABSTAIN (requirements unmet) as well as be NEUTRAL. */
export enum AnalysisSignal {
  PLAYER = 'PLAYER',
  BANKER = 'BANKER',
  NEUTRAL = 'NEUTRAL',
  ABSTAIN = 'ABSTAIN',
}

/** Structured reason codes (why a module produced its signal). */
export enum ReasonCode {
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  STRONG_STREAK = 'STRONG_STREAK',
  WEAK_STREAK = 'WEAK_STREAK',
  HIGH_ALTERNATION = 'HIGH_ALTERNATION',
  LOW_ALTERNATION = 'LOW_ALTERNATION',
  EXPECT_CONTINUATION = 'EXPECT_CONTINUATION',
  EXPECT_BREAK = 'EXPECT_BREAK',
  DISTRIBUTION_SKEW = 'DISTRIBUTION_SKEW',
  BALANCED_DISTRIBUTION = 'BALANCED_DISTRIBUTION',
  REGIME_STREAKY = 'REGIME_STREAKY',
  REGIME_CHOPPY = 'REGIME_CHOPPY',
  REGIME_MIXED = 'REGIME_MIXED',
  IN_TRANSITION = 'IN_TRANSITION',
  DERIVED_AGREEMENT = 'DERIVED_AGREEMENT',
  DERIVED_DISAGREEMENT = 'DERIVED_DISAGREEMENT',
  DATA_QUALITY_OK = 'DATA_QUALITY_OK',
  MODULE_DISABLED = 'MODULE_DISABLED',
  SHADOW_ONLY = 'SHADOW_ONLY',
  HISTORICAL_MATCH = 'HISTORICAL_MATCH',
  HISTORICAL_ABSTAIN = 'HISTORICAL_ABSTAIN',
}

/** Risk flags surfaced to downstream (voting/decision) layers. */
export enum RiskFlag {
  INSUFFICIENT_WARMUP = 'INSUFFICIENT_WARMUP',
  LOW_PAIR_COMPLETENESS = 'LOW_PAIR_COMPLETENESS',
  REVISIONS_PRESENT = 'REVISIONS_PRESENT',
  HISTORY_UNCONFIRMED = 'HISTORY_UNCONFIRMED',
  HIGH_VOLATILITY = 'HIGH_VOLATILITY',
  IN_TRANSITION = 'IN_TRANSITION',
  DERIVED_UNAVAILABLE = 'DERIVED_UNAVAILABLE',
}

export interface ModuleAnalysis {
  readonly moduleId: string;
  readonly signal: AnalysisSignal;
  readonly strength: number; // 0..1
  readonly reliability: number; // 0..1
  readonly status: ModuleStatus;
  readonly reasonCodes: readonly ReasonCode[];
  readonly riskFlags: readonly RiskFlag[];
  readonly version: string;
}

export interface AnalysisContext {
  readonly snapshot: ShoeStateSnapshot;
  readonly features: FeatureSet;
}

export interface AnalysisModule {
  readonly id: string;
  readonly version: string;
  readonly status: ModuleStatus;
  analyze(ctx: AnalysisContext): ModuleAnalysis;
}

/** Locked analyzer version registry (bump per versioned engine decision). */
export const ANALYZER_VERSIONS = Object.freeze({
  streak: 'STREAK-001',
  chop: 'CHOP-001',
  'run-length': 'RUNLEN-001',
  distribution: 'DIST-001',
  'regime-transition': 'REGIME-001',
  'data-quality-guard': 'DQG-001',
  volatility: 'VOL-001',
  'derived-road': 'DERIVED-001',
  'historical-matcher': 'HMATCH-001',
} as const);

export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/**
 * Versioned reliability-prior registry (bump per versioned engine decision).
 *
 * Bumped when any prior below is revised.
 */
export const RELIABILITY_PRIOR_VERSION = 'RELPRIOR-001';

/**
 * RELIABILITY_PRIORS — **UNCALIBRATED MVP PRIOR** trust assigned to each
 * analyzer *itself*.
 *
 * IMPORTANT (locked semantics — see docs/ENGINE_RULES.md):
 * - `reliability` is a deterministic, versioned prior for the analyzer module.
 *   It is **NOT** observed accuracy, an empirical win rate, or a calibrated
 *   statistic. These are conservative, hand-picked MVP placeholders and were
 *   **not** optimized against any test data.
 * - `reliability` MUST NOT depend on any current-shoe condition: non-Tie count,
 *   stabilityScore, volatilityScore, current streak, current regime, current
 *   Player/Banker distribution, shoe position, financial results, or sequence
 *   state. Those belong to other layers:
 *     • current pattern evidence  -> `strength`
 *     • insufficient observations -> activation requirement / ABSTAIN
 *     • regime suitability        -> Milestone-4 `context`
 *     • volatility / stability    -> Milestone-4 `risk` / `context`
 *     • data quality              -> Data Quality Guard
 *
 * Rationale for the conservative values (uncalibrated, domain-reasoned only):
 *   streak/chop are the two most fundamental directional reads (0.50);
 *   run-length and regime are secondary structural reads (0.45);
 *   distribution is the weakest directional read given baccarat's near-symmetric
 *   base rates (0.40); the Data Quality Guard is a non-directional meta guard
 *   (0.50); SHADOW_ONLY analyzers carry a low prior (0.30) and never influence a
 *   decision; the DISABLED Historical Matcher is 0.
 */
export const RELIABILITY_PRIORS = Object.freeze({
  streak: 0.5,
  chop: 0.5,
  'run-length': 0.45,
  distribution: 0.4,
  'regime-transition': 0.45,
  'data-quality-guard': 0.5,
  volatility: 0.3,
  'derived-road': 0.3,
  'historical-matcher': 0,
} as const);

export type ReliabilityPriorId = keyof typeof RELIABILITY_PRIORS;

/**
 * Fixed, versioned reliability prior for a module id. Deterministic and fully
 * independent of the current shoe. Unknown ids fall back to a conservative 0.3.
 */
export const reliabilityPrior = (moduleId: string): number =>
  (RELIABILITY_PRIORS as Record<string, number>)[moduleId] ?? 0.3;
