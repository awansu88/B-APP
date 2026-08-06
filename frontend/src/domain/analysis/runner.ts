/**
 * PART C — Analysis runner. Runs the modules over an immutable snapshot +
 * feature set and returns their results. DISABLED modules are NOT computed (per
 * ENGINE_RULES). SHADOW_ONLY / EXPERIMENTAL_ONLY modules ARE computed but are
 * returned separately and must never influence a decision. This milestone does
 * NOT perform voting, confidence, risk decisions, or prediction locking.
 */
import { ModuleStatus } from '../models/enums';
import { FEATURE_VERSION } from '../features/feature-extraction';
import { SNAPSHOT_VERSION } from '../snapshot/shoe-snapshot';
import { ALL_MODULES } from './modules';
import type { AnalysisContext, AnalysisModule, ModuleAnalysis } from './types';

export interface AnalysisReport {
  readonly snapshotVersion: string;
  readonly featureVersion: string;
  /** All computed results (ACTIVE + SHADOW/EXPERIMENTAL). DISABLED excluded. */
  readonly results: readonly ModuleAnalysis[];
  /** ACTIVE-module results — the only results eligible to influence decisions. */
  readonly activeResults: readonly ModuleAnalysis[];
  /** SHADOW_ONLY / EXPERIMENTAL_ONLY results — computed for logging only. */
  readonly shadowResults: readonly ModuleAnalysis[];
}

const isComputable = (m: AnalysisModule): boolean => m.status !== ModuleStatus.DISABLED;
const isInfluential = (r: ModuleAnalysis): boolean => r.status === ModuleStatus.ACTIVE;

/**
 * Run analysis. `modules` defaults to the locked registry order. Deterministic:
 * the same context + modules always yields the same report.
 */
export function runAnalysis(
  ctx: AnalysisContext,
  modules: readonly AnalysisModule[] = ALL_MODULES,
): AnalysisReport {
  const results = modules
    .filter(isComputable)
    .map((m) => m.analyze(ctx));
  return {
    snapshotVersion: SNAPSHOT_VERSION,
    featureVersion: FEATURE_VERSION,
    results,
    activeResults: results.filter(isInfluential),
    shadowResults: results.filter((r) => !isInfluential(r)),
  };
}
