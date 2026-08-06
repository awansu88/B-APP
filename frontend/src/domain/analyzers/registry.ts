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
 * The LOCKED MVP analyzer registry. Modes here are part of the frozen
 * architecture — do not flip a mode without a versioned engine decision.
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
    mode: ModuleStatus.DISABLED,
  },
] as const);
