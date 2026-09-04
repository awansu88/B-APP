import { ModuleStatus } from '../models/enums';

// `AnalyzerMode` is the Milestone 0 name; `ModuleStatus` is the canonical
// Milestone 1 enum. They are the same type (single source of truth).
export { ModuleStatus as AnalyzerMode };

export interface AnalyzerDescriptor {
  readonly id: string;
  readonly label: string;
  readonly mode: ModuleStatus;
}

/**
 * Operator-facing production capability registry. Historical Matcher is
 * reported ACTIVE here, but its authoritative vote is created only by the
 * dynamic HMATCH-002 audit adapter (it is not activated in ALL_MODULES).
 */
export const ANALYZER_REGISTRY: readonly AnalyzerDescriptor[] = Object.freeze([
  { id: 'streak', label: 'Streak Analyzer', mode: ModuleStatus.ACTIVE },
  { id: 'chop', label: 'Chop Analyzer', mode: ModuleStatus.ACTIVE },
  { id: 'run-length', label: 'Run-Length Analyzer', mode: ModuleStatus.ACTIVE },
  { id: 'distribution', label: 'Distribution Analyzer', mode: ModuleStatus.ACTIVE },
  {
    id: 'regime-transition',
    label: 'Regime and Transition Analyzer',
    mode: ModuleStatus.ACTIVE,
  },
  { id: 'data-quality-guard', label: 'Data Quality Guard', mode: ModuleStatus.ACTIVE },
  { id: 'volatility', label: 'Volatility Analyzer', mode: ModuleStatus.SHADOW_ONLY },
  {
    id: 'derived-road',
    label: 'Derived Road Analyzer',
    mode: ModuleStatus.SHADOW_ONLY,
  },
  {
    id: 'historical-matcher',
    label: 'Historical Matcher',
    mode: ModuleStatus.ACTIVE,
  },
] as const);
