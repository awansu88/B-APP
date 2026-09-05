import {
  MAX_UNCALIBRATED_CONFIDENCE,
  MIN_WARMUP_NON_TIE,
  THREE_WIN_TARGET,
} from '@/src/config/engine';
import {
  ANALYZER_REGISTRY,
  AnalyzerMode,
} from '@/src/domain/analyzers/registry';
import {
  ConfidenceCategory,
  categorizeConfidence,
} from '@/src/domain/confidence/categories';
import { Outcome } from '@/src/domain/models/outcome';
import { ENGINE_VERSION } from '@/src/domain/prediction';
import { PredictionDecision } from '@/src/domain/prediction/decision';
import {
  StepEvaluation,
  evaluateStep,
  evaluateThreeWinSequence,
} from '@/src/domain/prediction/sequence';

/**
 * Milestone 0 checks ONLY: locked constants, enum/type behaviour, and the
 * disabled/registry modes. NO engine logic (confidence, sequence) is
 * implemented yet — the corresponding functions must be explicit placeholders.
 */
describe('engine — locked constants & version', () => {
  it('carries the locked engine version', () => {
    expect(ENGINE_VERSION).toBe('ENGINE-002');
  });

  it('locks the core thresholds', () => {
    expect(MIN_WARMUP_NON_TIE).toBe(8);
    expect(MAX_UNCALIBRATED_CONFIDENCE).toBe(0.75);
    expect(THREE_WIN_TARGET).toBe(3);
  });
});

describe('engine — enum/type behaviour', () => {
  it('defines the three prediction decisions', () => {
    expect(Object.values(PredictionDecision)).toEqual([
      'BET_PLAYER',
      'BET_BANKER',
      'SKIP',
    ]);
  });

  it('defines the confidence categories', () => {
    expect(Object.values(ConfidenceCategory)).toEqual([
      'BELOW_THRESHOLD',
      'EXPERIMENTAL',
      'QUALIFIED',
      'HIGH_RECOMMENDATION',
    ]);
  });

  it('defines the step evaluations', () => {
    expect(Object.values(StepEvaluation)).toEqual([
      'WIN',
      'LOSS',
      'PUSH',
      'SKIP',
    ]);
  });
});

describe('engine — analyzer registry modes (data only, no analyzer logic)', () => {
  const mode = (id: string) => ANALYZER_REGISTRY.find((a) => a.id === id)?.mode;

  it('registers the six MVP analyzers as ACTIVE', () => {
    for (const id of [
      'streak',
      'chop',
      'run-length',
      'distribution',
      'regime-transition',
      'data-quality-guard',
    ]) {
      expect(mode(id)).toBe(AnalyzerMode.ACTIVE);
    }
  });

  it('reports Volatility/Derived Road controls and the dynamic Historical Matcher capability', () => {
    expect(mode('volatility')).toBe(AnalyzerMode.SHADOW_ONLY);
    expect(mode('derived-road')).toBe(AnalyzerMode.SHADOW_ONLY);
    expect(mode('historical-matcher')).toBe(AnalyzerMode.ACTIVE);
  });
});

describe('engine — logic is NOT implemented in Milestone 0 (placeholders throw)', () => {
  it('categorizeConfidence is an explicit unimplemented placeholder', () => {
    expect(() => categorizeConfidence(0.7)).toThrow(
      'not implemented in Milestone 0',
    );
  });

  it('evaluateStep is an explicit unimplemented placeholder', () => {
    expect(() =>
      evaluateStep(PredictionDecision.BET_PLAYER, Outcome.PLAYER),
    ).toThrow('not implemented in Milestone 0');
  });

  it('evaluateThreeWinSequence is an explicit unimplemented placeholder', () => {
    expect(() => evaluateThreeWinSequence([])).toThrow(
      'not implemented in Milestone 0',
    );
  });
});
