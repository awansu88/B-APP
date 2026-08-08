/**
 * Milestone 6 — PURE statistics tests. Literal expected values; no DB.
 */
import { computeFullStatistics } from '@/src/domain/statistics';
import type { BappDataset, LockedPredictionEntryRecord } from '@/src/domain/backup/dataset';
import { EMPTY_DATASET } from '@/src/domain/backup/dataset';
import type { RoundRecord } from '@/src/domain/models/round';
import type { RevisionRecord, ShoeRecord } from '@/src/domain/models/records';
import { SessionProfile } from '@/src/domain/session';

const shoe = (id: string): ShoeRecord => ({
  id, label: null, environment: 'LIVE_FORWARD' as ShoeRecord['environment'],
  status: 'ACTIVE' as ShoeRecord['status'], roundCount: 0, createdAt: 't', updatedAt: 't',
});

const round = (id: string, shoeId: string, n: number, winner: string): RoundRecord => ({
  id, shoeId, roundNumber: n, winner: winner as RoundRecord['winner'],
  playerPair: 'UNKNOWN' as RoundRecord['playerPair'], bankerPair: 'UNKNOWN' as RoundRecord['bankerPair'],
  source: 'LIVE' as RoundRecord['source'], createdAt: 't',
});

type LpePartial = Partial<LockedPredictionEntryRecord> &
  Pick<LockedPredictionEntryRecord, 'decision' | 'category' | 'evaluation'>;

/** Build LPE records; sequenceIndex assigned by array order within a shoe. */
function entries(shoeId: string, list: readonly LpePartial[]): LockedPredictionEntryRecord[] {
  return list.map((p, i) => ({
    id: p.id ?? `${shoeId}-e${i}`,
    shoeId,
    targetRoundNumber: p.targetRoundNumber ?? i + 1,
    sequenceIndex: p.sequenceIndex ?? i,
    status: p.status ?? 'EVALUATED',
    decision: p.decision,
    side: p.side ?? null,
    confidence: p.confidence ?? 0.6,
    category: p.category,
    operatorAction: p.operatorAction ?? 'PLAYED',
    evaluation: p.evaluation,
    actualWinner: p.actualWinner ?? null,
    invalidated: p.invalidated ?? false,
    invalidatedByRevisionId: null,
    invalidatedAt: null,
    lockedAt: 't',
    evaluatedAt: 't',
    payloadVersion: 'SESSION-001',
    payload: '{}',
    createdAt: 't',
  }));
}

const dataset = (over: Partial<BappDataset>): BappDataset => ({ ...EMPTY_DATASET, ...over });

describe('statistics — overall + empty', () => {
  it('empty dataset yields zeros and undefined (null percent) win rate', () => {
    const s = computeFullStatistics(EMPTY_DATASET);
    expect(s.overall).toEqual({ totalShoes: 0, totalRounds: 0, playerCount: 0, bankerCount: 0, tieCount: 0, nonTieCount: 0 });
    expect(s.predictions.totalLocked).toBe(0);
    expect(s.results.winRate.percent).toBeNull();
    expect(s.engine.eligibleAttempts).toBe(0);
  });

  it('counts winners across raw rounds (P/B/T + non-tie)', () => {
    const rounds = [
      round('r1', 'S1', 1, 'PLAYER'),
      round('r2', 'S1', 2, 'BANKER'),
      round('r3', 'S1', 3, 'TIE'),
      round('r4', 'S1', 4, 'PLAYER'),
      round('r5', 'S1', 5, 'BANKER'),
    ];
    const s = computeFullStatistics(dataset({ shoes: [shoe('S1')], rounds }));
    expect(s.overall).toEqual({ totalShoes: 1, totalRounds: 5, playerCount: 2, bankerCount: 2, tieCount: 1, nonTieCount: 4 });
  });
});

describe('statistics — predictions / results / invalidation', () => {
  it('classifies decisions and WIN/LOSS/PUSH/SKIPPED; excludes invalidated', () => {
    const lpe = entries('S1', [
      { decision: 'BET_PLAYER', category: 'QUALIFIED', evaluation: 'WIN' },
      { decision: 'BET_PLAYER', category: 'QUALIFIED', evaluation: 'LOSS' },
      { decision: 'BET_BANKER', category: 'HIGH_RECOMMENDATION', evaluation: 'PUSH' },
      { decision: 'SKIP', category: 'BELOW_THRESHOLD', evaluation: 'SKIPPED', operatorAction: 'NOT_PLAYED' },
      // invalidated entry must be excluded everywhere
      { decision: 'BET_BANKER', category: 'QUALIFIED', evaluation: 'INVALIDATED', invalidated: true },
    ]);
    const s = computeFullStatistics(dataset({ shoes: [shoe('S1')], lockedPredictions: lpe }));
    expect(s.predictions).toEqual({ totalLocked: 5, valid: 4, invalidated: 1, betPlayer: 2, betBanker: 1, skip: 1 });
    expect(s.results).toEqual({
      win: 1, loss: 1, push: 1, skipped: 1,
      winRate: { numerator: 1, denominator: 2, percent: 50 },
    });
  });
});

describe('statistics — categories + player/banker', () => {
  it('buckets valid BET predictions by confidence category', () => {
    const lpe = entries('S1', [
      { decision: 'BET_PLAYER', category: 'EXPERIMENTAL', evaluation: 'WIN' },
      { decision: 'BET_PLAYER', category: 'EXPERIMENTAL', evaluation: 'LOSS' },
      { decision: 'BET_BANKER', category: 'QUALIFIED', evaluation: 'WIN' },
      { decision: 'BET_BANKER', category: 'HIGH_RECOMMENDATION', evaluation: 'PUSH' },
    ]);
    const s = computeFullStatistics(dataset({ shoes: [shoe('S1')], lockedPredictions: lpe }));
    const exp = s.categories.find((c) => c.category === 'EXPERIMENTAL')!;
    expect(exp).toMatchObject({ totalBet: 2, win: 1, loss: 1, push: 0 });
    expect(exp.winRate.percent).toBe(50);
    const high = s.categories.find((c) => c.category === 'HIGH_RECOMMENDATION')!;
    expect(high).toMatchObject({ totalBet: 1, win: 0, loss: 0, push: 1 });
    expect(high.winRate.percent).toBeNull();
  });

  it('splits BET_PLAYER vs BET_BANKER outcomes', () => {
    const lpe = entries('S1', [
      { decision: 'BET_PLAYER', category: 'QUALIFIED', evaluation: 'WIN' },
      { decision: 'BET_PLAYER', category: 'QUALIFIED', evaluation: 'WIN' },
      { decision: 'BET_BANKER', category: 'QUALIFIED', evaluation: 'LOSS' },
    ]);
    const s = computeFullStatistics(dataset({ shoes: [shoe('S1')], lockedPredictions: lpe }));
    expect(s.betPlayer).toMatchObject({ win: 2, loss: 0, push: 0 });
    expect(s.betBanker).toMatchObject({ win: 0, loss: 1, push: 0 });
  });
});

describe('statistics — engine vs played + three-win sequences', () => {
  it('completes a three-win sequence and computes engine/played paper', () => {
    const lpe = entries('S1', [
      { decision: 'BET_PLAYER', category: 'QUALIFIED', evaluation: 'WIN', operatorAction: 'PLAYED' },
      { decision: 'BET_PLAYER', category: 'QUALIFIED', evaluation: 'WIN', operatorAction: 'PLAYED' },
      { decision: 'BET_PLAYER', category: 'QUALIFIED', evaluation: 'WIN', operatorAction: 'NOT_PLAYED' },
    ]);
    const s = computeFullStatistics(dataset({ shoes: [shoe('S1')], lockedPredictions: lpe }));
    // ENGINE counts all three recommendations -> one completed 3-win (EXP+ / QUAL+).
    expect(s.engine.completedByProfile[SessionProfile.EXPERIMENTAL_PLUS]).toBe(1);
    expect(s.engine.completedByProfile[SessionProfile.QUALIFIED_PLUS]).toBe(1);
    expect(s.engine.completedByProfile[SessionProfile.HIGH_ONLY]).toBe(0);
    expect(s.engine.eligibleAttempts).toBe(3);
    expect(s.engine.paper).toMatchObject({ unitsStaked: 3, netUnits: 3, wins: 3 });
    // PLAYED excludes the NOT_PLAYED win -> no completion, 2 units.
    expect(s.played.completedByProfile[SessionProfile.EXPERIMENTAL_PLUS]).toBe(0);
    expect(s.played.eligibleAttempts).toBe(2);
    expect(s.played.paper).toMatchObject({ unitsStaked: 2, netUnits: 2, wins: 2 });
  });

  it('never crosses shoe boundaries', () => {
    const s = computeFullStatistics(
      dataset({
        shoes: [shoe('S1'), shoe('S2')],
        lockedPredictions: [
          ...entries('S1', [
            { decision: 'BET_PLAYER', category: 'QUALIFIED', evaluation: 'WIN' },
            { decision: 'BET_PLAYER', category: 'QUALIFIED', evaluation: 'WIN' },
          ]),
          ...entries('S2', [{ decision: 'BET_PLAYER', category: 'QUALIFIED', evaluation: 'WIN' }]),
        ],
      }),
    );
    // Two wins in S1 + one win in S2 must NOT complete a cross-shoe 3-win.
    expect(s.engine.completedByProfile[SessionProfile.EXPERIMENTAL_PLUS]).toBe(0);
  });

  it('counts a chain-breaking loss as a failed sequence', () => {
    const lpe = entries('S1', [
      { decision: 'BET_PLAYER', category: 'QUALIFIED', evaluation: 'WIN' },
      { decision: 'BET_PLAYER', category: 'QUALIFIED', evaluation: 'WIN' },
      { decision: 'BET_PLAYER', category: 'QUALIFIED', evaluation: 'LOSS' },
    ]);
    const s = computeFullStatistics(dataset({ shoes: [shoe('S1')], lockedPredictions: lpe }));
    expect(s.engine.failedByProfile[SessionProfile.EXPERIMENTAL_PLUS]).toBe(1);
    expect(s.engine.completedByProfile[SessionProfile.EXPERIMENTAL_PLUS]).toBe(0);
    expect(s.engine.paper).toMatchObject({ unitsStaked: 3, netUnits: 1, wins: 2, losses: 1 });
  });
});

describe('statistics — revisions', () => {
  it('counts revisions by action and invalidated predictions', () => {
    const revisions: RevisionRecord[] = [
      { id: 'v1', shoeId: 'S1', roundNumber: 1, action: 'INSERT', before: null, after: '{}', createdAt: 't' },
      { id: 'v2', shoeId: 'S1', roundNumber: 2, action: 'UPDATE', before: '{}', after: '{}', createdAt: 't' },
      { id: 'v3', shoeId: 'S1', roundNumber: 3, action: 'DELETE', before: '{}', after: null, createdAt: 't' },
    ];
    const lpe = entries('S1', [
      { decision: 'BET_PLAYER', category: 'QUALIFIED', evaluation: 'INVALIDATED', invalidated: true },
    ]);
    const s = computeFullStatistics(dataset({ shoes: [shoe('S1')], revisions, lockedPredictions: lpe }));
    expect(s.revisions).toEqual({ totalRevisions: 3, inserts: 1, updates: 1, deletes: 1, invalidatedPredictions: 1 });
  });
});
