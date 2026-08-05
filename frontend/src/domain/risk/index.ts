import { VERSION_REGISTRY } from '../../config/versions';

/**
 * Risk model (Milestone 0: contract only, no logic).
 * The MVP performs NO Martingale execution and NO automated staking
 * (see deferred features in docs/MVP_SPEC.md).
 */
export const RISK_VERSION = VERSION_REGISTRY.risk;

export interface RiskAssessment {
  readonly allowRecommendation: boolean;
  readonly notes: readonly string[];
}
