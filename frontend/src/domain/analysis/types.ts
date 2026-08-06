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
