import { VERSION_REGISTRY } from '../../config/versions';
import { SessionEnvironment } from '../session/environment';
import { ConfidenceCategory } from '../confidence/categories';
import { PredictionDecision } from './decision';

export const ENGINE_VERSION = VERSION_REGISTRY.engine;
export const PREDICTION_CONFIG_VERSION = VERSION_REGISTRY.config;

/**
 * A LockedPrediction is captured BEFORE its actual result is known
 * (Project Principle #5). Its config version is immutable for the batch
 * (Principle #4).
 */
export interface LockedPrediction {
  readonly id: string;
  readonly shoeId: string;
  readonly roundIndex: number;
  readonly environment: SessionEnvironment;
  readonly decision: PredictionDecision;
  readonly confidence: number;
  readonly category: ConfidenceCategory;
  readonly engineVersion: string;
  readonly configVersion: string;
  readonly lockedAt: string;
}

export * from './decision';
export * from './sequence';
