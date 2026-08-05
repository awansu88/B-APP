import { VERSION_REGISTRY } from '../config/versions';
import {
  MAX_UNCALIBRATED_CONFIDENCE,
  MIN_WARMUP_NON_TIE,
} from '../config/engine';
import { ANALYZER_REGISTRY } from '../domain/analyzers/registry';

/** A read-only diagnostics snapshot of the locked configuration. */
export interface DiagnosticsSnapshot {
  readonly versions: typeof VERSION_REGISTRY;
  readonly analyzers: typeof ANALYZER_REGISTRY;
  readonly thresholds: {
    readonly minWarmupNonTie: number;
    readonly maxUncalibratedConfidence: number;
  };
  readonly generatedAt: string;
}

/** Build a diagnostics snapshot (pure aside from the timestamp). */
export function buildDiagnosticsSnapshot(): DiagnosticsSnapshot {
  return {
    versions: VERSION_REGISTRY,
    analyzers: ANALYZER_REGISTRY,
    thresholds: {
      minWarmupNonTie: MIN_WARMUP_NON_TIE,
      maxUncalibratedConfidence: MAX_UNCALIBRATED_CONFIDENCE,
    },
    generatedAt: new Date().toISOString(),
  };
}
