/**
 * Module -> family mapping used by the Family Correlation Cap.
 *
 * Trend: streak, run-length, distribution
 * Alternation: chop
 * Context: regime-transition
 * Structure: derived-road (SHADOW_ONLY)
 * Risk: volatility (SHADOW_ONLY)
 * Historical: historical-matcher (dynamic HMATCH-002 voter)
 */
import { ModuleFamily } from './types';

const FAMILY_BY_MODULE: Readonly<Record<string, ModuleFamily>> = Object.freeze({
  streak: ModuleFamily.TREND,
  'run-length': ModuleFamily.TREND,
  distribution: ModuleFamily.TREND,
  chop: ModuleFamily.ALTERNATION,
  'regime-transition': ModuleFamily.CONTEXT,
  'derived-road': ModuleFamily.STRUCTURE,
  volatility: ModuleFamily.RISK,
  'historical-matcher': ModuleFamily.HISTORICAL,
  'data-quality-guard': ModuleFamily.QUALITY,
});

/** Deterministic iteration order for family contributions. */
export const FAMILY_ORDER: readonly ModuleFamily[] = Object.freeze([
  ModuleFamily.TREND,
  ModuleFamily.ALTERNATION,
  ModuleFamily.CONTEXT,
  ModuleFamily.STRUCTURE,
  ModuleFamily.RISK,
  ModuleFamily.HISTORICAL,
  ModuleFamily.QUALITY,
]);

export const familyOf = (moduleId: string): ModuleFamily =>
  FAMILY_BY_MODULE[moduleId] ?? ModuleFamily.QUALITY;
