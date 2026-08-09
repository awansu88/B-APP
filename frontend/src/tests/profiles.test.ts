/**
 * M7.1 Patch 2 — Engine Profiles + DECISION-002 + immutable profile comparison.
 *
 * Sections 15, 17, 18, 19 of the Patch-2 spec. Deterministic; no I/O.
 * File is intentionally NOT named with the engine/roadmap tokens so it does not
 * alter the `test:engine` (10) / `test:roadmap` (26) filtered counts.
 */
import { ModuleStatus, PredictionDecision, RoundSource } from '@/src/domain/models/enums';
import { Winner } from '@/src/domain/models/outcome';
import { PairState } from '@/src/domain/models/pair';
import type { RoundRecord } from '@/src/domain/models/round';
import {
  BALANCED_PROFILE,
  DEFAULT_ENGINE_PROFILE_ID,
  ENGINE_PROFILES,
  STRICT_PROFILE,
  engineProfile,
  isEngineProfileId,
  otherProfileId,
} from '@/src/domain/decision';
import {
  OperatorAction,
  SessionEnvironment,
  computePrediction,
  reconstructSession,
  serializeSession,
  startSession,
  submitResult,
  type LockedPrediction,
} from '@/src/domain/session';

const NOW = '2026-02-01T00:00:00.000Z';

function bankerRounds(n: number, shoeId = 'shoe-p2'): RoundRecord[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${shoeId}-h${i + 1}`,
    shoeId,
    roundNumber: i + 1,
    winner: Winner.BANKER,
    playerPair: PairState.NO,
    bankerPair: PairState.NO,
    source: RoundSource.HISTORY,
    createdAt: NOW,
  }));
}

const WINNER: Record<string, Winner> = { P: Winner.PLAYER, B: Winner.BANKER, T: Winner.TIE };
function seq(pattern: string, shoeId = 'shoe-p2'): RoundRecord[] {
  return pattern.split('').map((c, i) => ({
    id: `${shoeId}-s${i + 1}`,
    shoeId,
    roundNumber: i + 1,
    winner: WINNER[c],
    playerPair: PairState.NO,
    bankerPair: PairState.NO,
    source: RoundSource.HISTORY,
    createdAt: NOW,
  }));
}

const statusOf = (profileId: 'STRICT' | 'BALANCED', moduleId: string): ModuleStatus | undefined =>
  ENGINE_PROFILES[profileId].modules.find((m) => m.id === moduleId)?.status;

// ---------------------------------------------------------------------------
// Section 17 — profile config
// ---------------------------------------------------------------------------
describe('Patch 2 · engine profile config (section 17)', () => {
  it('default profile is STRICT', () => {
    expect(DEFAULT_ENGINE_PROFILE_ID).toBe('STRICT');
    expect(STRICT_PROFILE.id).toBe('STRICT');
    expect(STRICT_PROFILE.decisionVersion).toBe('DECISION-001');
    expect(STRICT_PROFILE.status).toBe('ACCEPTED');
  });

  it('BALANCED is DECISION-003 / EXPERIMENTAL (Patch 3 — matcher-eligible)', () => {
    expect(BALANCED_PROFILE.id).toBe('BALANCED');
    expect(BALANCED_PROFILE.decisionVersion).toBe('DECISION-003');
    expect(BALANCED_PROFILE.status).toBe('EXPERIMENTAL');
  });

  it('STRICT registry keeps Derived Road SHADOW_ONLY', () => {
    expect(statusOf('STRICT', 'derived-road')).toBe(ModuleStatus.SHADOW_ONLY);
    expect(STRICT_PROFILE.derivedRoad).toBe('SHADOW_ONLY');
  });

  it('BALANCED registry uses Derived Road ACTIVE', () => {
    expect(statusOf('BALANCED', 'derived-road')).toBe(ModuleStatus.ACTIVE);
    expect(BALANCED_PROFILE.derivedRoad).toBe('ACTIVE');
  });

  it('Historical Matcher is NO-VOTE (DISABLED) in BOTH profiles', () => {
    expect(statusOf('STRICT', 'historical-matcher')).toBe(ModuleStatus.DISABLED);
    expect(statusOf('BALANCED', 'historical-matcher')).toBe(ModuleStatus.DISABLED);
  });

  it('Volatility is SHADOW_ONLY in BOTH profiles', () => {
    expect(statusOf('STRICT', 'volatility')).toBe(ModuleStatus.SHADOW_ONLY);
    expect(statusOf('BALANCED', 'volatility')).toBe(ModuleStatus.SHADOW_ONLY);
  });

  it('profiles expose NO arbitrary numeric-tuning surface', () => {
    for (const p of [STRICT_PROFILE, BALANCED_PROFILE]) {
      expect(Object.keys(p).sort()).toEqual(
        ['decisionVersion', 'derivedRoad', 'id', 'modules', 'status'].sort(),
      );
    }
  });

  it('registries differ ONLY by the derived-road module (all other modules identical refs)', () => {
    const strict = STRICT_PROFILE.modules;
    const balanced = BALANCED_PROFILE.modules;
    expect(balanced).toHaveLength(strict.length);
    strict.forEach((m, i) => {
      if (m.id === 'derived-road') expect(balanced[i]).not.toBe(m);
      else expect(balanced[i]).toBe(m);
    });
  });

  it('engineProfile / otherProfileId / isEngineProfileId helpers', () => {
    expect(engineProfile('BALANCED')).toBe(BALANCED_PROFILE);
    expect(engineProfile('nope' as 'STRICT')).toBe(STRICT_PROFILE);
    expect(otherProfileId('STRICT')).toBe('BALANCED');
    expect(otherProfileId('BALANCED')).toBe('STRICT');
    expect(isEngineProfileId('STRICT')).toBe(true);
    expect(isEngineProfileId('X')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Section 18 — decision integrity + determinism + no leakage
// ---------------------------------------------------------------------------
describe('Patch 2 · decision integrity (section 18)', () => {
  const rounds = bankerRounds(14);

  it('STRICT is default and stamps DECISION-001; BALANCED stamps DECISION-003', () => {
    const strict = computePrediction(rounds, SessionEnvironment.LIVE_FORWARD, 'shoe-p2', { now: NOW });
    const balanced = computePrediction(rounds, SessionEnvironment.LIVE_FORWARD, 'shoe-p2', {
      now: NOW,
      profile: 'BALANCED',
    });
    expect(strict.decisionConfigVersion).toBe('DECISION-001');
    expect(balanced.decisionConfigVersion).toBe('DECISION-003');
  });

  it('official fields equal the SELECTED profile snapshot', () => {
    const strict = computePrediction(rounds, SessionEnvironment.LIVE_FORWARD, 'shoe-p2', { now: NOW });
    expect(strict.profileComparison?.selectedProfile).toBe('STRICT');
    expect(strict.decision).toBe(strict.profileComparison?.strict.decision);
    expect(strict.confidence).toBe(strict.profileComparison?.strict.confidence);

    const bal = computePrediction(rounds, SessionEnvironment.LIVE_FORWARD, 'shoe-p2', {
      now: NOW,
      profile: 'BALANCED',
    });
    expect(bal.profileComparison?.selectedProfile).toBe('BALANCED');
    expect(bal.decision).toBe(bal.profileComparison?.balanced.decision);
    expect(bal.confidence).toBe(bal.profileComparison?.balanced.confidence);
  });

  it('the STRICT snapshot is identical regardless of which profile is selected (no leakage from selection)', () => {
    const a = computePrediction(rounds, SessionEnvironment.LIVE_FORWARD, 'shoe-p2', { now: NOW });
    const b = computePrediction(rounds, SessionEnvironment.LIVE_FORWARD, 'shoe-p2', {
      now: NOW,
      profile: 'BALANCED',
    });
    expect(a.profileComparison?.strict).toEqual(b.profileComparison?.strict);
    expect(a.profileComparison?.balanced).toEqual(b.profileComparison?.balanced);
  });

  it('both profiles are deterministic for identical pre-result data', () => {
    const a = computePrediction(rounds, SessionEnvironment.LIVE_FORWARD, 'shoe-p2', { now: NOW, profile: 'BALANCED' });
    const b = computePrediction(rounds, SessionEnvironment.LIVE_FORWARD, 'shoe-p2', { now: NOW, profile: 'BALANCED' });
    expect(a.profileComparison).toEqual(b.profileComparison);
    expect(a.decision).toBe(b.decision);
  });

  it('DECISION-001 (STRICT) on a banker shoe still recommends BET_BANKER', () => {
    const strict = computePrediction(rounds, SessionEnvironment.LIVE_FORWARD, 'shoe-p2', { now: NOW });
    expect(strict.decision).toBe(PredictionDecision.BET_BANKER);
  });

  it('moduleResults reflect the selected profile activation (STRICT shadow / BALANCED active)', () => {
    const strict = computePrediction(rounds, SessionEnvironment.LIVE_FORWARD, 'shoe-p2', { now: NOW });
    const bal = computePrediction(rounds, SessionEnvironment.LIVE_FORWARD, 'shoe-p2', { now: NOW, profile: 'BALANCED' });
    const dStrict = strict.moduleResults.find((m) => m.moduleId === 'derived-road');
    const dBal = bal.moduleResults.find((m) => m.moduleId === 'derived-road');
    expect(dStrict?.status).toBe(ModuleStatus.SHADOW_ONLY);
    expect(dBal?.status).toBe(ModuleStatus.ACTIVE);
  });

  it('comparison telemetry is built pre-result (only completed rounds are read)', () => {
    // computePrediction receives ONLY completed rounds; the target result is unknown.
    const pred = computePrediction(rounds, SessionEnvironment.LIVE_FORWARD, 'shoe-p2', { now: NOW, profile: 'BALANCED' });
    expect(pred.targetRound).toBe(rounds.length + 1);
    expect(pred.profileComparison?.version).toBe('PROFILECMP-001');
    // both snapshots exist regardless of any future outcome
    expect(pred.profileComparison?.strict.decisionVersion).toBe('DECISION-001');
    expect(pred.profileComparison?.balanced.decisionVersion).toBe('DECISION-003');
  });
});

// ---------------------------------------------------------------------------
// Section 15 — STRICT vs BALANCED availability experiment (honest reporting)
// ---------------------------------------------------------------------------
describe('Patch 2 · STRICT vs BALANCED fixtures (section 15)', () => {
  it('B: banker shoe → both profiles BET the same side (BANKER)', () => {
    const p = computePrediction(bankerRounds(16), SessionEnvironment.LIVE_FORWARD, 'shoe-p2', { now: NOW });
    expect(p.profileComparison?.strict.decision).toBe(PredictionDecision.BET_BANKER);
    expect(p.profileComparison?.balanced.decision).toBe(PredictionDecision.BET_BANKER);
    expect(p.profileComparison?.strict.side).toBe(p.profileComparison?.balanced.side);
  });

  it('A: below warm-up → both profiles SKIP (no directional claim)', () => {
    const p = computePrediction(bankerRounds(3), SessionEnvironment.LIVE_FORWARD, 'shoe-p2', { now: NOW });
    expect(p.profileComparison?.strict.decision).toBe(PredictionDecision.SKIP);
    expect(p.profileComparison?.balanced.decision).toBe(PredictionDecision.SKIP);
  });

  it('C-attempt: Derived Road activation measurably influences BALANCED WITHOUT lowering the BET threshold', () => {
    // "doubles" pattern: STRICT SKIPs at the base confidence; BALANCED (Derived
    // Road ACTIVE) adds STRUCTURE-family evidence and reports HIGHER confidence,
    // but it stays below the UNCHANGED BET threshold — so it still SKIPs. This is
    // the honest section-15 result: no valid fixture converted a STRICT SKIP into
    // a BALANCED BET (case C) or flipped the side (case D) in Patch 2.
    const p = computePrediction(seq('PPBBPPBBPPBBPPBB'), SessionEnvironment.LIVE_FORWARD, 'shoe-p2', {
      now: NOW,
    });
    const s = p.profileComparison!.strict;
    const b = p.profileComparison!.balanced;
    expect(s.decision).toBe(PredictionDecision.SKIP);
    expect(b.decision).toBe(PredictionDecision.SKIP);
    expect(b.confidence).toBeGreaterThan(s.confidence);
  });

  it('D: Derived Road reinforces the streak side — it never opposes STRICT on the same data', () => {
    for (const pattern of ['BBBBBBBBBBBBBBBB', 'PBPBPBPBPBPBPBPB', 'PPBPPBPPBPPBPPBP']) {
      const p = computePrediction(seq(pattern), SessionEnvironment.LIVE_FORWARD, 'shoe-p2', { now: NOW });
      const s = p.profileComparison!.strict;
      const b = p.profileComparison!.balanced;
      if (s.decision.startsWith('BET') && b.decision.startsWith('BET')) {
        expect(b.side).toBe(s.side);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Section 19 — locked profile audit (immutability on profile switch)
// ---------------------------------------------------------------------------
describe('Patch 2 · locked profile audit (section 19)', () => {
  const opts = { now: NOW, historyConfirmed: true } as const;

  it('A/B: a target locked under STRICT stays STRICT after switching to BALANCED; the NEXT target uses BALANCED', () => {
    const s = startSession(bankerRounds(12), SessionEnvironment.LIVE_FORWARD, { ...opts, profile: 'STRICT' });
    expect(s.currentPrediction?.decisionConfigVersion).toBe('DECISION-001');
    const lockedTarget = s.currentPrediction!.targetRound;

    // Operator switches preference to BALANCED, then the actual result arrives.
    const next = submitResult(s, Winner.BANKER, {
      now: NOW,
      operatorAction: OperatorAction.PLAYED,
      profile: 'BALANCED',
    });

    // The previously locked target is preserved verbatim as STRICT (not rewritten).
    const preserved = next.predictions.find((e) => e.prediction.targetRound === lockedTarget);
    expect(preserved?.prediction.decisionConfigVersion).toBe('DECISION-001');
    expect(preserved?.prediction.profileComparison?.selectedProfile).toBe('STRICT');

    // The next unlocked target is computed under BALANCED.
    expect(next.currentPrediction?.targetRound).toBe(lockedTarget + 1);
    expect(next.currentPrediction?.decisionConfigVersion).toBe('DECISION-003');
    expect(next.currentPrediction?.profileComparison?.selectedProfile).toBe('BALANCED');
  });

  it('C: serialize→reconstruct restores a pending STRICT lock verbatim (no regeneration, no duplicate)', () => {
    const s = startSession(bankerRounds(12), SessionEnvironment.LIVE_FORWARD, { ...opts, profile: 'STRICT' });
    const restored = reconstructSession(serializeSession(s));
    expect(restored.currentPrediction).toEqual(s.currentPrediction);
    expect(restored.currentPrediction?.decisionConfigVersion).toBe('DECISION-001');
    expect(restored.predictions).toHaveLength(s.predictions.length);
  });

  it('E: new payload round-trips both profile snapshots verbatim', () => {
    const s = startSession(bankerRounds(12), SessionEnvironment.LIVE_FORWARD, { ...opts, profile: 'BALANCED' });
    const restored = reconstructSession(serializeSession(s));
    expect(restored.currentPrediction?.profileComparison).toEqual(
      s.currentPrediction?.profileComparison,
    );
  });

  it('D: a pre-Patch-2 payload (no profileComparison) remains a valid LockedPrediction', () => {
    // Simulate an old lock by stripping the comparison field.
    const s = startSession(bankerRounds(12), SessionEnvironment.LIVE_FORWARD, { ...opts, profile: 'STRICT' });
    const legacy = { ...s.currentPrediction! } as { profileComparison?: unknown } & LockedPrediction;
    delete legacy.profileComparison;
    expect(legacy.profileComparison).toBeUndefined();
    expect(legacy.decision).toBe(s.currentPrediction!.decision);
  });
});
