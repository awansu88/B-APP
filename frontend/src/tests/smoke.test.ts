import { VERSION_REGISTRY } from '@/src/config/versions';
import {
  MAX_UNCALIBRATED_CONFIDENCE,
  MIN_WARMUP_NON_TIE,
  THREE_WIN_TARGET,
} from '@/src/config/engine';
import { UI_OUTCOME_ORDER, Outcome } from '@/src/domain/models/outcome';
import { SessionEnvironment } from '@/src/domain/session/environment';
import { PredictionDecision } from '@/src/domain/prediction/decision';
import { buildDiagnosticsSnapshot } from '@/src/diagnostics';

describe('B-APP smoke — locked version registry & core enums', () => {
  it('exposes the locked version registry', () => {
    expect(VERSION_REGISTRY.app).toBe('0.1.0');
    expect(VERSION_REGISTRY.engine).toBe('ENGINE-002');
    expect(VERSION_REGISTRY.config).toBe('CFG-001');
    expect(VERSION_REGISTRY.databaseSchema).toBe('DB-002');
    expect(VERSION_REGISTRY.roadmap).toBe('ROADMAP-001');
    expect(VERSION_REGISTRY.feature).toBe('FEATURE-001');
    expect(VERSION_REGISTRY.voting).toBe('VOTE-001');
    expect(VERSION_REGISTRY.confidence).toBe('CONF-001');
    expect(VERSION_REGISTRY.risk).toBe('RISK-001');
  });

  it('locks the core engine thresholds', () => {
    expect(MIN_WARMUP_NON_TIE).toBe(8);
    expect(MAX_UNCALIBRATED_CONFIDENCE).toBe(0.75);
    expect(THREE_WIN_TARGET).toBe(3);
  });

  it('orders UI outcomes as P / T / B', () => {
    expect(UI_OUTCOME_ORDER).toEqual([
      Outcome.PLAYER,
      Outcome.TIE,
      Outcome.BANKER,
    ]);
  });

  it('defines the three session environments', () => {
    expect(Object.values(SessionEnvironment)).toEqual([
      'HISTORY_INPUT',
      'LIVE_FORWARD',
      'HISTORICAL_TEST',
    ]);
  });

  it('defines the three prediction decisions', () => {
    expect(Object.values(PredictionDecision)).toEqual([
      'BET_PLAYER',
      'BET_BANKER',
      'SKIP',
    ]);
  });

  it('builds a diagnostics snapshot from the locked config', () => {
    const snapshot = buildDiagnosticsSnapshot();
    expect(snapshot.versions.engine).toBe('ENGINE-002');
    expect(snapshot.thresholds.minWarmupNonTie).toBe(8);
    expect(typeof snapshot.generatedAt).toBe('string');
  });
});
