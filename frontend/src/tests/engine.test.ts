import {
  categorizeConfidence,
  ConfidenceCategory,
} from '@/src/domain/confidence/categories';
import {
  ANALYZER_REGISTRY,
  AnalyzerMode,
} from '@/src/domain/analyzers/registry';
import {
  evaluateStep,
  evaluateThreeWinSequence,
  StepEvaluation,
} from '@/src/domain/prediction/sequence';
import { PredictionDecision } from '@/src/domain/prediction/decision';
import { Outcome } from '@/src/domain/models/outcome';
import { ENGINE_VERSION } from '@/src/domain/prediction';

describe('engine — confidence categories (CONF-001)', () => {
  it('classifies each locked confidence band', () => {
    expect(categorizeConfidence(0.5)).toBe(ConfidenceCategory.BELOW_THRESHOLD);
    expect(categorizeConfidence(0.55)).toBe(ConfidenceCategory.EXPERIMENTAL);
    expect(categorizeConfidence(0.59)).toBe(ConfidenceCategory.EXPERIMENTAL);
    expect(categorizeConfidence(0.6)).toBe(ConfidenceCategory.QUALIFIED);
    expect(categorizeConfidence(0.69)).toBe(ConfidenceCategory.QUALIFIED);
    expect(categorizeConfidence(0.7)).toBe(ConfidenceCategory.HIGH_RECOMMENDATION);
    expect(categorizeConfidence(0.75)).toBe(ConfidenceCategory.HIGH_RECOMMENDATION);
  });

  it('clamps anything above 0.75 to HIGH_RECOMMENDATION (max uncalibrated)', () => {
    expect(categorizeConfidence(0.9)).toBe(ConfidenceCategory.HIGH_RECOMMENDATION);
    expect(categorizeConfidence(1.5)).toBe(ConfidenceCategory.HIGH_RECOMMENDATION);
  });
});

describe('engine — locked analyzer modes', () => {
  const mode = (id: string) =>
    ANALYZER_REGISTRY.find((a) => a.id === id)?.mode;

  it('keeps the six MVP analyzers active', () => {
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

  it('runs Volatility & Derived Road in shadow and disables Historical Matcher', () => {
    expect(mode('volatility')).toBe(AnalyzerMode.SHADOW_ONLY);
    expect(mode('derived-road')).toBe(AnalyzerMode.SHADOW_ONLY);
    expect(mode('historical-matcher')).toBe(AnalyzerMode.DISABLED);
  });
});

describe('engine — step evaluation (Tie is PUSH)', () => {
  it('scores a Player recommendation', () => {
    expect(evaluateStep(PredictionDecision.BET_PLAYER, Outcome.PLAYER)).toBe(
      StepEvaluation.WIN,
    );
    expect(evaluateStep(PredictionDecision.BET_PLAYER, Outcome.BANKER)).toBe(
      StepEvaluation.LOSS,
    );
    expect(evaluateStep(PredictionDecision.BET_PLAYER, Outcome.TIE)).toBe(
      StepEvaluation.PUSH,
    );
  });

  it('treats SKIP decisions as SKIP regardless of outcome', () => {
    expect(evaluateStep(PredictionDecision.SKIP, Outcome.PLAYER)).toBe(
      StepEvaluation.SKIP,
    );
    expect(evaluateStep(PredictionDecision.SKIP, Outcome.TIE)).toBe(
      StepEvaluation.SKIP,
    );
  });
});

describe('engine — three-win sequence rules', () => {
  it('achieves on three consecutive wins', () => {
    const state = evaluateThreeWinSequence([
      StepEvaluation.WIN,
      StepEvaluation.WIN,
      StepEvaluation.WIN,
    ]);
    expect(state.achieved).toBe(true);
    expect(state.consecutiveWins).toBe(3);
  });

  it('ignores SKIP and PUSH (Tie) — they neither advance nor break', () => {
    const state = evaluateThreeWinSequence([
      StepEvaluation.WIN,
      StepEvaluation.SKIP,
      StepEvaluation.WIN,
      StepEvaluation.PUSH,
      StepEvaluation.WIN,
    ]);
    expect(state.achieved).toBe(true);
    expect(state.failed).toBe(false);
  });

  it('fails (resets) the current sequence on a LOSS', () => {
    const state = evaluateThreeWinSequence([
      StepEvaluation.WIN,
      StepEvaluation.WIN,
      StepEvaluation.LOSS,
      StepEvaluation.WIN,
    ]);
    expect(state.achieved).toBe(false);
    expect(state.failed).toBe(true);
    expect(state.consecutiveWins).toBe(1);
  });

  it('carries the locked engine version', () => {
    expect(ENGINE_VERSION).toBe('ENGINE-001');
  });
});
