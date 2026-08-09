/**
 * M7.1 Patch 2 — Profile-comparison statistics (section 20). Deterministic; pure.
 * Verifies STRICT vs BALANCED availability + observed W/L/P over immutable stored
 * telemetry, NOT_AVAILABLE handling for pre-Patch-2 records, invalidated
 * exclusion, and that comparison telemetry is independent of the played ledger.
 */
import type { BappDataset, LockedPredictionEntryRecord } from '@/src/domain/backup/dataset';
import {
  computeProfileComparisonFromDataset,
  evaluateSnapshotOutcome,
  tallyObserved,
} from '@/src/domain/observability';

const NOW = '2026-02-01T00:00:00.000Z';

interface Snap {
  readonly decision: string;
  readonly playerScore?: number;
  readonly bankerScore?: number;
  readonly reasonCodes?: readonly string[];
}

interface Cmp {
  readonly selectedProfile: 'STRICT' | 'BALANCED';
  readonly strict: Snap;
  readonly balanced: Snap;
}

function makeCmp(selectedProfile: 'STRICT' | 'BALANCED', strict: string, balanced: string): Cmp {
  return {
    selectedProfile,
    strict: { decision: strict, playerScore: 0.4, bankerScore: 0.5, reasonCodes: ['X'] },
    balanced: { decision: balanced, playerScore: 0.4, bankerScore: 0.5, reasonCodes: ['X'] },
  };
}

function entry(
  id: string,
  cmp: Cmp | null,
  actualWinner: string | null,
  invalidated = false,
  operatorAction = 'UNSET',
): LockedPredictionEntryRecord {
  const official = cmp
    ? cmp.selectedProfile === 'BALANCED'
      ? cmp.balanced.decision
      : cmp.strict.decision
    : 'SKIP';
  return {
    id,
    shoeId: 's1',
    targetRoundNumber: 1,
    sequenceIndex: 0,
    status: 'LOCKED',
    decision: official,
    side: null,
    confidence: 0,
    category: 'NONE',
    operatorAction,
    evaluation: invalidated ? 'INVALIDATED' : 'PENDING',
    actualWinner,
    invalidated,
    invalidatedByRevisionId: invalidated ? 'rev-1' : null,
    invalidatedAt: invalidated ? NOW : null,
    lockedAt: NOW,
    evaluatedAt: null,
    payloadVersion: 'SESSION-001',
    payload: JSON.stringify(cmp ? { profileComparison: { version: 'PROFILECMP-001', ...cmp } } : {}),
    createdAt: NOW,
  };
}

function dataset(entries: LockedPredictionEntryRecord[]): BappDataset {
  return { shoes: [], rounds: [], revisions: [], lockedPredictions: entries, sessionStates: [] };
}

describe('Patch 2 · pure observed-outcome evaluation', () => {
  it('applies accepted M5 semantics (Tie = PUSH; SKIP never W/L)', () => {
    expect(evaluateSnapshotOutcome('BET_BANKER', 'BANKER')).toBe('WIN');
    expect(evaluateSnapshotOutcome('BET_BANKER', 'PLAYER')).toBe('LOSS');
    expect(evaluateSnapshotOutcome('BET_PLAYER', 'PLAYER')).toBe('WIN');
    expect(evaluateSnapshotOutcome('BET_BANKER', 'TIE')).toBe('PUSH');
    expect(evaluateSnapshotOutcome('SKIP', 'BANKER')).toBe('SKIP');
    expect(evaluateSnapshotOutcome('BET_BANKER', null)).toBe('PENDING');
  });

  it('winRate = W/(W+L), PUSH excluded', () => {
    const o = tallyObserved(['WIN', 'WIN', 'LOSS', 'PUSH', 'SKIP']);
    expect(o).toEqual({ resolved: 4, win: 2, loss: 1, push: 1, winRate: 0.6667 });
  });
});

describe('Patch 2 · profile-comparison statistics (section 20)', () => {
  it('no Patch-2 data → available 0, everything NOT_AVAILABLE', () => {
    const r = computeProfileComparisonFromDataset(dataset([entry('a', null, 'BANKER'), entry('b', null, null)]));
    expect(r.available).toBe(0);
    expect(r.notAvailable).toBe(2);
    expect(r.strict.availability.eligible).toBe(0);
    expect(r.balanced.availability.eligible).toBe(0);
  });

  it('BET/SKIP availability separated per profile', () => {
    const r = computeProfileComparisonFromDataset(
      dataset([
        entry('a', makeCmp('STRICT', 'SKIP', 'BET_BANKER'), null),
        entry('b', makeCmp('STRICT', 'BET_BANKER', 'BET_BANKER'), null),
      ]),
    );
    expect(r.available).toBe(2);
    expect(r.strict.availability.bet).toBe(1);
    expect(r.strict.availability.skip).toBe(1);
    expect(r.balanced.availability.bet).toBe(2);
    expect(r.balanced.availability.skip).toBe(0);
    expect(r.balanced.availability.betBanker).toBe(2);
  });

  it('observed W/L/P separated per profile (derived from immutable side + actual)', () => {
    // STRICT bets BANKER, BALANCED bets PLAYER; actual BANKER → STRICT WIN, BALANCED LOSS.
    const r = computeProfileComparisonFromDataset(
      dataset([
        entry('a', makeCmp('STRICT', 'BET_BANKER', 'BET_PLAYER'), 'BANKER'),
        entry('b', makeCmp('STRICT', 'BET_BANKER', 'BET_PLAYER'), 'TIE'),
      ]),
    );
    expect(r.strict.observed.win).toBe(1);
    expect(r.strict.observed.loss).toBe(0);
    expect(r.strict.observed.push).toBe(1);
    expect(r.strict.observed.winRate).toBe(1);
    expect(r.balanced.observed.loss).toBe(1);
    expect(r.balanced.observed.push).toBe(1);
    expect(r.balanced.observed.winRate).toBe(0);
  });

  it('selected-profile counts are tracked', () => {
    const r = computeProfileComparisonFromDataset(
      dataset([
        entry('a', makeCmp('STRICT', 'SKIP', 'BET_BANKER'), null),
        entry('b', makeCmp('BALANCED', 'SKIP', 'BET_BANKER'), null),
        entry('c', makeCmp('BALANCED', 'BET_BANKER', 'BET_BANKER'), null),
      ]),
    );
    expect(r.selectedStrict).toBe(1);
    expect(r.selectedBalanced).toBe(2);
  });

  it('INVALIDATED records are excluded from BOTH available and notAvailable', () => {
    const r = computeProfileComparisonFromDataset(
      dataset([
        entry('a', makeCmp('STRICT', 'BET_BANKER', 'BET_BANKER'), 'BANKER'),
        entry('bad', makeCmp('STRICT', 'BET_BANKER', 'BET_BANKER'), 'PLAYER', true),
      ]),
    );
    expect(r.available).toBe(1);
    expect(r.notAvailable).toBe(0);
    expect(r.strict.observed.loss).toBe(0); // invalidated LOSS not counted
  });

  it('pre-Patch-2 records mixed with Patch-2 records → counted as notAvailable', () => {
    const r = computeProfileComparisonFromDataset(
      dataset([
        entry('a', makeCmp('STRICT', 'BET_BANKER', 'BET_BANKER'), 'BANKER'),
        entry('old', null, 'PLAYER'),
      ]),
    );
    expect(r.available).toBe(1);
    expect(r.notAvailable).toBe(1);
  });

  it('comparison telemetry is INDEPENDENT of the played ledger (operatorAction)', () => {
    const unset = computeProfileComparisonFromDataset(
      dataset([entry('a', makeCmp('STRICT', 'BET_BANKER', 'BET_PLAYER'), 'BANKER', false, 'UNSET')]),
    );
    const played = computeProfileComparisonFromDataset(
      dataset([entry('a', makeCmp('STRICT', 'BET_BANKER', 'BET_PLAYER'), 'BANKER', false, 'PLAYED')]),
    );
    expect(unset.strict.observed).toEqual(played.strict.observed);
    expect(unset.balanced.observed).toEqual(played.balanced.observed);
  });
});
