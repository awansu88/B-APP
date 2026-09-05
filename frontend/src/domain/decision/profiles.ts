/**
 * M7.1 Patch 2 — Engine Profiles (versioned analyzer-activation registries).
 *
 * A profile controls a KNOWN, versioned configuration — never arbitrary numeric
 * tuning. The ONLY behavioral difference between STRICT and BALANCED is the
 * analyzer activation registry: BALANCED activates the Derived Road analyzer
 * (STRUCTURE family) that STRICT keeps SHADOW_ONLY. All accepted DECISION-001
 * gates (voting math, confidence bands/cap, risk semantics, data-quality gate)
 * are shared unchanged — no confidence-threshold reduction, no VOTE-001 change.
 *
 * The static Historical Matcher placeholder stays DISABLED in both registries;
 * the one authoritative dynamic HMATCH-002 module is appended by the session
 * engine. Volatility stays SHADOW_ONLY. BALANCED is the production default;
 * STRICT remains a matcher-free legacy/control path.
 */
import { ALL_MODULES, derivedRoadAnalyzerActive } from '../analysis/modules';
import type { AnalysisModule } from '../analysis/types';

export type EngineProfileId = 'STRICT' | 'BALANCED';

export type EngineProfileStatus = 'ACCEPTED' | 'EXPERIMENTAL';

export interface EngineProfile {
  readonly id: EngineProfileId;
  /** Versioned decision label stamped on results/locks produced under this profile. */
  readonly decisionVersion: string;
  readonly status: EngineProfileStatus;
  /** Derived Road activation for this profile. */
  readonly derivedRoad: 'SHADOW_ONLY' | 'ACTIVE';
  /** The analyzer registry passed to `runAnalysis`. */
  readonly modules: readonly AnalysisModule[];
}

/**
 * BALANCED registry = the accepted registry with the Derived Road module swapped
 * for its ACTIVE variant. Every other module (activation + math) is identical.
 */
const BALANCED_MODULES: readonly AnalysisModule[] = Object.freeze(
  ALL_MODULES.map((m) => (m.id === 'derived-road' ? derivedRoadAnalyzerActive : m)),
);

export const STRICT_PROFILE: EngineProfile = Object.freeze({
  id: 'STRICT',
  decisionVersion: 'DECISION-001',
  status: 'ACCEPTED',
  derivedRoad: 'SHADOW_ONLY',
  modules: ALL_MODULES,
});

export const BALANCED_PROFILE: EngineProfile = Object.freeze({
  id: 'BALANCED',
  decisionVersion: 'DECISION-003',
  status: 'ACCEPTED',
  derivedRoad: 'ACTIVE',
  modules: BALANCED_MODULES,
});

export const ENGINE_PROFILES: Readonly<Record<EngineProfileId, EngineProfile>> = Object.freeze({
  STRICT: STRICT_PROFILE,
  BALANCED: BALANCED_PROFILE,
});

/** Official production profile. STRICT remains available only as a legacy/control path. */
export const DEFAULT_ENGINE_PROFILE_ID: EngineProfileId = 'BALANCED';

export const isEngineProfileId = (v: unknown): v is EngineProfileId =>
  v === 'STRICT' || v === 'BALANCED';

/** Resolve a profile by id; unknown ids fall back to the accepted STRICT profile. */
export const engineProfile = (id: EngineProfileId): EngineProfile =>
  ENGINE_PROFILES[id] ?? STRICT_PROFILE;

/** The non-selected (comparison/control) profile id. */
export const otherProfileId = (id: EngineProfileId): EngineProfileId =>
  id === 'STRICT' ? 'BALANCED' : 'STRICT';
