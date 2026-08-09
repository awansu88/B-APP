/**
 * M7.1 Patch 1 — Decision Observability tests (pure, deterministic).
 *
 * The observability layer is READ-ONLY: it must never change or reclassify the
 * official DECISION-001 decision, only explain/aggregate the stored trace.
 */
import {
  computeAvailability,
  computeMatcherReadiness,
  countCompletedShoes,
  countNonTieRounds,
  deriveDirectionalLean,
  deriveSkipDiagnostic,
  LeanSide,
  MATCHER_REQUIRED_NONTIE_ROUNDS,
  MATCHER_REQUIRED_SHOES,
  SkipReason,
  topSkipReasons,
  type DecisionTraceLike,
} from '../domain/observability/decision-observability';
import {
  computeAvailabilityFromDataset,
  matcherReadinessFromDataset,
  recordToTrace,
} from '../domain/observability/dataset-observability';
import { ShoeStatus, RoundSource, SessionEnvironment } from '../domain/models/enums';
import { Winner } from '../domain/models/outcome';
import { PairState } from '../domain/models/pair';
import type { ShoeRecord } from '../domain/models/records';
import type { RoundRecord } from '../domain/models/round';
import type { BappDataset, LockedPredictionEntryRecord } from '../domain/backup/dataset';

const bet = (side: 'PLAYER' | 'BANKER', p = 1, b = 0.5): DecisionTraceLike => ({
  decision: side === 'PLAYER' ? 'BET_PLAYER' : 'BET_BANKER',
  reasonCodes: ['DIRECTIONAL_CONSENSUS', 'DATA_QUALITY_PASS'],
  riskFlags: [],
  playerScore: side === 'PLAYER' ? p : b,
  bankerScore: side === 'PLAYER' ? b : p,
});

const skip = (
  reasonCodes: string[],
  riskFlags: string[] = [],
  playerScore = 0.4,
  bankerScore = 0.5,
): DecisionTraceLike => ({ decision: 'SKIP', reasonCodes, riskFlags, playerScore, bankerScore });

describe('Directional Lean', () => {
  it('PLAYER when player score > banker score', () => {
    const lean = deriveDirectionalLean(0.7, 0.3);
    expect(lean.side).toBe(LeanSide.PLAYER);
    expect(lean.hasEvidence).toBe(true);
    expect(lean.evidenceShare).toBe(0.7);
  });
  it('BANKER when banker score > player score', () => {
    expect(deriveDirectionalLean(0.2, 0.6).side).toBe(LeanSide.BANKER);
  });
  it('NONE on a tie (equal scores) with evidence share 0.5', () => {
    const lean = deriveDirectionalLean(0.5, 0.5);
    expect(lean.side).toBe(LeanSide.NONE);
    expect(lean.evidenceShare).toBe(0.5);
    expect(lean.hasEvidence).toBe(true);
  });
  it('NONE with no evidence (zero totals)', () => {
    const lean = deriveDirectionalLean(0, 0);
    expect(lean.side).toBe(LeanSide.NONE);
    expect(lean.hasEvidence).toBe(false);
    expect(lean.evidenceShare).toBeNull();
  });
  it('NONE with no evidence (undefined scores → NOT AVAILABLE)', () => {
    const lean = deriveDirectionalLean(undefined, undefined);
    expect(lean.side).toBe(LeanSide.NONE);
    expect(lean.hasEvidence).toBe(false);
  });
});

describe('SKIP reason', () => {
  it('BELOW_THRESHOLD from below-min-agreement', () => {
    const d = deriveSkipDiagnostic(skip(['BELOW_MIN_AGREEMENT', 'DATA_QUALITY_PASS']));
    expect(d.isSkip).toBe(true);
    expect(d.primaryReason).toBe(SkipReason.BELOW_THRESHOLD);
    expect(d.reasons).toEqual([SkipReason.BELOW_THRESHOLD]);
  });
  it('CONFLICT from a moderate-conflict risk flag', () => {
    const d = deriveSkipDiagnostic(skip(['INSUFFICIENT_EVIDENCE'], ['MODERATE_CONFLICT']));
    expect(d.reasons).toContain(SkipReason.CONFLICT);
    // conflict has higher precedence than below-threshold
    expect(d.primaryReason).toBe(SkipReason.CONFLICT);
  });
  it('deterministic multi-reason precedence (data-quality block wins)', () => {
    const d = deriveSkipDiagnostic(
      skip(['DATA_QUALITY_BLOCK', 'BELOW_MIN_AGREEMENT'], ['MODERATE_CONFLICT']),
    );
    expect(d.primaryReason).toBe(SkipReason.DATA_QUALITY_BLOCK);
    expect(d.reasons).toEqual([
      SkipReason.DATA_QUALITY_BLOCK,
      SkipReason.CONFLICT,
      SkipReason.BELOW_THRESHOLD,
    ]);
  });
  it('STRONG_OPPOSITION outranks BELOW_THRESHOLD', () => {
    const d = deriveSkipDiagnostic(skip(['STRONG_OPPOSITION_SKIP', 'BELOW_MIN_AGREEMENT']));
    expect(d.primaryReason).toBe(SkipReason.STRONG_OPPOSITION);
  });
  it('OTHER_ACCEPTED_PIPELINE_REASON when a SKIP has trace but no known code', () => {
    const d = deriveSkipDiagnostic(skip(['SOME_FUTURE_CODE']));
    expect(d.primaryReason).toBe(SkipReason.OTHER_ACCEPTED_PIPELINE_REASON);
  });
  it('NOT_AVAILABLE when a SKIP has no stored trace', () => {
    const d = deriveSkipDiagnostic({ decision: 'SKIP' });
    expect(d.traceAvailable).toBe(false);
    expect(d.primaryReason).toBe(SkipReason.NOT_AVAILABLE);
  });
  it('a BET produces no SKIP reason and does not reclassify', () => {
    const d = deriveSkipDiagnostic(bet('BANKER'));
    expect(d.isSkip).toBe(false);
    expect(d.primaryReason).toBeNull();
    expect(d.reasons).toEqual([]);
  });
});

describe('Decision availability', () => {
  it('zero eligible → null rates, zero counts', () => {
    const a = computeAvailability([]);
    expect(a.eligible).toBe(0);
    expect(a.bet).toBe(0);
    expect(a.skip).toBe(0);
    expect(a.betRate).toBeNull();
    expect(a.skipRate).toBeNull();
  });
  it('all SKIP → bet 0, betRate 0, explicit denominator', () => {
    const a = computeAvailability([skip(['BELOW_MIN_AGREEMENT']), skip(['NO_DIRECTIONAL_SIGNAL'])]);
    expect(a.eligible).toBe(2);
    expect(a.bet).toBe(0);
    expect(a.skip).toBe(2);
    expect(a.betRate).toBe(0);
  });
  it('mixed BET/SKIP with an explicit denominator (3 / 24 = 0.125)', () => {
    const traces: DecisionTraceLike[] = [];
    for (let i = 0; i < 3; i += 1) traces.push(bet('PLAYER'));
    for (let i = 0; i < 21; i += 1) traces.push(skip(['BELOW_MIN_AGREEMENT']));
    const a = computeAvailability(traces);
    expect(a.eligible).toBe(24);
    expect(a.bet).toBe(3);
    expect(a.skip).toBe(21);
    expect(a.betRate).toBe(0.125);
  });
  it('tallies lean counts and top skip reasons over SKIPs', () => {
    const a = computeAvailability([
      skip(['BELOW_MIN_AGREEMENT'], [], 0.6, 0.4), // PLAYER lean, BELOW_THRESHOLD
      skip(['BELOW_MIN_AGREEMENT'], [], 0.3, 0.7), // BANKER lean, BELOW_THRESHOLD
      skip(['NO_DIRECTIONAL_SIGNAL'], [], 0, 0), // NONE lean, INSUFFICIENT_DIRECTIONAL_SUPPORT
    ]);
    expect(a.leanPlayer).toBe(1);
    expect(a.leanBanker).toBe(1);
    expect(a.leanNone).toBe(1);
    const top = topSkipReasons(a, 3);
    expect(top[0]).toEqual({ reason: SkipReason.BELOW_THRESHOLD, count: 2 });
  });
  it('does not mutate a frozen input trace (read-only)', () => {
    const t = Object.freeze(skip(['BELOW_MIN_AGREEMENT'])) as DecisionTraceLike;
    expect(() => computeAvailability([t])).not.toThrow();
    expect(t.decision).toBe('SKIP');
  });
});

describe('Historical Matcher readiness', () => {
  it('0 shoes / 0 rounds → COLLECTING', () => {
    const r = computeMatcherReadiness(0, 0);
    expect(r.eligibility).toBe('COLLECTING');
    expect(r.collectionActive).toBe(true);
    expect(r.votingEnabled).toBe(false);
    expect(r.requiredShoes).toBe(MATCHER_REQUIRED_SHOES);
    expect(r.requiredNonTieRounds).toBe(MATCHER_REQUIRED_NONTIE_ROUNDS);
  });
  it('99 completed shoes + 5000 non-Tie → COLLECTING (shoes short)', () => {
    expect(computeMatcherReadiness(99, 5000).eligibility).toBe('COLLECTING');
  });
  it('100 completed shoes + 4999 non-Tie → COLLECTING (rounds short)', () => {
    expect(computeMatcherReadiness(100, 4999).eligibility).toBe('COLLECTING');
  });
  it('100 completed shoes + 5000 non-Tie → ELIGIBLE (both thresholds)', () => {
    expect(computeMatcherReadiness(100, 5000).eligibility).toBe('ELIGIBLE');
  });
  it('above thresholds remains ELIGIBLE with voting still disabled', () => {
    const r = computeMatcherReadiness(150, 6000);
    expect(r.eligibility).toBe('ELIGIBLE');
    expect(r.votingEnabled).toBe(false);
  });
});

describe('Dataset adapters (verbatim payload; no regeneration)', () => {
  const shoe = (id: string, status: ShoeStatus): ShoeRecord => ({
    id,
    label: null,
    environment: SessionEnvironment.LIVE_FORWARD,
    status,
    roundCount: 0,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  });
  const round = (id: string, winner: Winner): RoundRecord => ({
    id,
    shoeId: 's1',
    roundNumber: 1,
    winner,
    playerPair: PairState.UNKNOWN,
    bankerPair: PairState.UNKNOWN,
    source: RoundSource.LIVE,
    createdAt: '2025-01-01T00:00:00.000Z',
  });
  const lockRec = (
    decision: string,
    payload: string | null,
    invalidated = false,
  ): LockedPredictionEntryRecord => ({
    id: `p-${decision}-${Math.random()}`,
    shoeId: 's1',
    targetRoundNumber: 9,
    sequenceIndex: 0,
    status: 'LOCKED',
    decision,
    side: null,
    confidence: 0.5,
    category: 'BELOW_THRESHOLD',
    operatorAction: 'UNSET',
    evaluation: 'PENDING',
    actualWinner: null,
    invalidated,
    invalidatedByRevisionId: null,
    invalidatedAt: null,
    lockedAt: '2025-01-01T00:00:00.000Z',
    evaluatedAt: null,
    payloadVersion: 'SESSION-1',
    payload: payload ?? '',
    createdAt: '2025-01-01T00:00:00.000Z',
  });

  it('countCompletedShoes counts COMPLETED and ARCHIVED (not ACTIVE)', () => {
    const shoes = [
      shoe('a', ShoeStatus.ACTIVE),
      shoe('b', ShoeStatus.COMPLETED),
      shoe('c', ShoeStatus.ARCHIVED),
    ];
    expect(countCompletedShoes(shoes)).toBe(2);
  });
  it('countNonTieRounds excludes ties', () => {
    const rounds = [round('1', Winner.PLAYER), round('2', Winner.TIE), round('3', Winner.BANKER)];
    expect(countNonTieRounds(rounds)).toBe(2);
  });
  it('recordToTrace reads reason/score trace from the verbatim payload', () => {
    const payload = JSON.stringify({
      decision: 'SKIP',
      reasonCodes: ['BELOW_MIN_AGREEMENT'],
      riskFlags: ['MODERATE_CONFLICT'],
      playerScore: 0.4,
      bankerScore: 0.6,
    });
    const trace = recordToTrace(lockRec('SKIP', payload));
    const d = deriveSkipDiagnostic(trace);
    expect(d.primaryReason).toBe(SkipReason.CONFLICT);
    expect(d.lean.side).toBe(LeanSide.BANKER);
  });
  it('recordToTrace marks a SKIP NOT_AVAILABLE when payload is empty (no regeneration)', () => {
    const d = deriveSkipDiagnostic(recordToTrace(lockRec('SKIP', null)));
    expect(d.traceAvailable).toBe(false);
    expect(d.primaryReason).toBe(SkipReason.NOT_AVAILABLE);
  });
  it('dataset availability counts BET/SKIP from top-level decision and excludes invalidated', () => {
    const dataset = {
      shoes: [shoe('s1', ShoeStatus.ACTIVE)],
      rounds: [],
      revisions: [],
      lockedPredictions: [
        lockRec('BET_PLAYER', null),
        lockRec('SKIP', null),
        lockRec('SKIP', null),
        lockRec('BET_BANKER', null, true), // invalidated → excluded
      ],
      sessionStates: [],
    } as unknown as BappDataset;
    const a = computeAvailabilityFromDataset(dataset);
    expect(a.eligible).toBe(3);
    expect(a.bet).toBe(1);
    expect(a.skip).toBe(2);
    expect(a.traceUnavailable).toBe(2);
  });
  it('matcherReadinessFromDataset derives from shoes + rounds', () => {
    const dataset = {
      shoes: [shoe('s1', ShoeStatus.COMPLETED)],
      rounds: [round('1', Winner.PLAYER), round('2', Winner.TIE)],
      revisions: [],
      lockedPredictions: [],
      sessionStates: [],
    } as unknown as BappDataset;
    const r = matcherReadinessFromDataset(dataset);
    expect(r.completedShoes).toBe(1);
    expect(r.nonTieRounds).toBe(1);
    expect(r.eligibility).toBe('COLLECTING');
  });
});
