/**
 * Analyzer operating modes (LOCKED for the MVP).
 *  - ACTIVE:            contributes to voting.
 *  - SHADOW_ONLY:       computed and logged, never influences a decision.
 *  - EXPERIMENTAL_ONLY: available behind an explicit experimental flag only.
 *  - DISABLED:          not computed at all in the MVP.
 */
export enum AnalyzerMode {
  ACTIVE = 'ACTIVE',
  SHADOW_ONLY = 'SHADOW_ONLY',
  EXPERIMENTAL_ONLY = 'EXPERIMENTAL_ONLY',
  DISABLED = 'DISABLED',
}

export interface AnalyzerDescriptor {
  readonly id: string;
  readonly label: string;
  readonly mode: AnalyzerMode;
}

/**
 * The LOCKED MVP analyzer registry. Modes here are part of the frozen
 * architecture — do not flip a mode without a versioned engine decision.
 */
export const ANALYZER_REGISTRY: readonly AnalyzerDescriptor[] = Object.freeze([
  { id: 'streak', label: 'Streak Analyzer', mode: AnalyzerMode.ACTIVE },
  { id: 'chop', label: 'Chop Analyzer', mode: AnalyzerMode.ACTIVE },
  { id: 'run-length', label: 'Run-Length Analyzer', mode: AnalyzerMode.ACTIVE },
  { id: 'distribution', label: 'Distribution Analyzer', mode: AnalyzerMode.ACTIVE },
  {
    id: 'regime-transition',
    label: 'Regime and Transition Analyzer',
    mode: AnalyzerMode.ACTIVE,
  },
  { id: 'data-quality-guard', label: 'Data Quality Guard', mode: AnalyzerMode.ACTIVE },
  { id: 'volatility', label: 'Volatility Analyzer', mode: AnalyzerMode.SHADOW_ONLY },
  {
    id: 'derived-road',
    label: 'Derived Road Analyzer',
    mode: AnalyzerMode.SHADOW_ONLY,
  },
  {
    id: 'historical-matcher',
    label: 'Historical Matcher',
    mode: AnalyzerMode.DISABLED,
  },
] as const);
