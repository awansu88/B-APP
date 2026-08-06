/**
 * Milestone 2 — History Input workflow (pure domain) tests.
 *
 * These exercise the UI-independent building blocks: result entry, pair-input
 * modes, draft reset, the double-tap / busy guard, undo, edit, delete, full
 * roadmap rebuild after mutation, checkpoint cadence, and the 8-non-Tie warm-up
 * gate. No React / RN / Expo / SQLite is involved.
 */
import { Winner } from '@/src/domain/models/outcome';
import { PairState } from '@/src/domain/models/pair';
import { RoundSource } from '@/src/domain/models/enums';
import type { RoundRecord } from '@/src/domain/models/round';
import { buildRoadmap } from '@/src/domain/roadmap/engine';
import {
  BusyError,
  MIN_NON_TIE_RESULTS,
  PairInputMode,
  TransactionGuard,
  appendRound,
  canStartForwardModes,
  computeStatistics,
  deleteRound,
  editRound,
  emptyDraft,
  isCheckpointRound,
  nonTieResultsRemaining,
  resetDraft,
  resolvePairState,
  togglePlayerPair,
  undoLast,
} from '@/src/domain/history';

const NOW = '2026-01-01T00:00:00.000Z';
const SHOE = 's1';

const ctx = (n: number) => ({ now: NOW, newRoundId: `${SHOE}-r${n}` });

/** Build an ordered shoe from a list of winners (no pairs). */
function shoeFrom(winners: readonly Winner[]): readonly RoundRecord[] {
  let rounds: readonly RoundRecord[] = [];
  winners.forEach((w, i) => {
    rounds = appendRound(
      rounds,
      SHOE,
      w,
      PairState.UNKNOWN,
      PairState.UNKNOWN,
      RoundSource.HISTORY,
      ctx(i + 1),
    ).rounds;
  });
  return rounds;
}

describe('history — result entry', () => {
  it('adds a PLAYER result as round 1', () => {
    const { rounds } = appendRound(
      [],
      SHOE,
      Winner.PLAYER,
      PairState.NO,
      PairState.NO,
      RoundSource.HISTORY,
      ctx(1),
    );
    expect(rounds).toHaveLength(1);
    expect(rounds[0].winner).toBe(Winner.PLAYER);
    expect(rounds[0].roundNumber).toBe(1);
  });

  it('adds a TIE result and keeps it in the raw history', () => {
    const { rounds } = appendRound(
      [],
      SHOE,
      Winner.TIE,
      PairState.UNKNOWN,
      PairState.UNKNOWN,
      RoundSource.HISTORY,
      ctx(1),
    );
    expect(rounds[0].winner).toBe(Winner.TIE);
    expect(computeStatistics(rounds).tieTotal).toBe(1);
    expect(computeStatistics(rounds).nonTieRounds).toBe(0);
  });

  it('adds a BANKER result and appends after existing rounds', () => {
    const first = shoeFrom([Winner.PLAYER]);
    const { rounds } = appendRound(
      first,
      SHOE,
      Winner.BANKER,
      PairState.NO,
      PairState.NO,
      RoundSource.HISTORY,
      ctx(2),
    );
    expect(rounds.map((r) => r.winner)).toEqual([Winner.PLAYER, Winner.BANKER]);
    expect(rounds[1].roundNumber).toBe(2);
  });

  it('records an INSERT revision for every appended round', () => {
    const result = appendRound(
      [],
      SHOE,
      Winner.PLAYER,
      PairState.NO,
      PairState.NO,
      RoundSource.HISTORY,
      ctx(1),
    );
    expect(result.revision.action).toBe('INSERT');
    expect(result.revision.before).toBeNull();
    expect(result.revision.after).toContain('PLAYER');
  });
});

describe('history — pair input modes', () => {
  it('COMPLETE mode: an unselected pair means NO; selected means YES', () => {
    expect(resolvePairState(false, PairInputMode.COMPLETE)).toBe(PairState.NO);
    expect(resolvePairState(true, PairInputMode.COMPLETE)).toBe(PairState.YES);
  });

  it('PARTIAL mode: an unselected pair means UNKNOWN; selected means YES', () => {
    expect(resolvePairState(false, PairInputMode.PARTIAL)).toBe(
      PairState.UNKNOWN,
    );
    expect(resolvePairState(true, PairInputMode.PARTIAL)).toBe(PairState.YES);
  });

  it('resets PP/BP selections automatically after a save (mode preserved)', () => {
    let draft = emptyDraft(PairInputMode.COMPLETE);
    draft = togglePlayerPair(draft);
    expect(draft.playerPairSelected).toBe(true);
    const reset = resetDraft(draft);
    expect(reset.playerPairSelected).toBe(false);
    expect(reset.bankerPairSelected).toBe(false);
    expect(reset.pairMode).toBe(PairInputMode.COMPLETE);
  });
});

describe('history — double-tap / busy guard', () => {
  it('rejects a second write while the first is still running', async () => {
    const guard = new TransactionGuard();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = guard.run(async () => {
      await gate;
      return 'first';
    });
    expect(guard.isBusy).toBe(true);

    await expect(guard.run(async () => 'second')).rejects.toBeInstanceOf(
      BusyError,
    );

    release();
    await expect(first).resolves.toBe('first');
    expect(guard.isBusy).toBe(false);
  });

  it('tryRun ignores a re-entrant call', () => {
    const guard = new TransactionGuard();
    let ran = 0;
    const ok = guard.tryRun(() => {
      ran += 1;
      // attempt a nested (double) tap while busy
      const nested = guard.tryRun(() => {
        ran += 1;
      });
      expect(nested).toBe(false);
    });
    expect(ok).toBe(true);
    expect(ran).toBe(1);
  });
});

describe('history — undo / edit / delete', () => {
  it('undo removes the most recent round and returns a DELETE revision', () => {
    const rounds = shoeFrom([Winner.PLAYER, Winner.BANKER, Winner.PLAYER]);
    const result = undoLast(rounds, ctx(99));
    expect(result).not.toBeNull();
    expect(result!.rounds).toHaveLength(2);
    expect(result!.rounds.map((r) => r.roundNumber)).toEqual([1, 2]);
    expect(result!.revision.action).toBe('DELETE');
  });

  it('undo on an empty shoe returns null', () => {
    expect(undoLast([], ctx(1))).toBeNull();
  });

  it('edit changes a round in place and produces an UPDATE revision', () => {
    const rounds = shoeFrom([Winner.PLAYER, Winner.BANKER, Winner.PLAYER]);
    const result = editRound(
      rounds,
      2,
      {
        winner: Winner.PLAYER,
        playerPair: PairState.YES,
        bankerPair: PairState.NO,
      },
      ctx(99),
    );
    expect(result).not.toBeNull();
    expect(result!.rounds[1].winner).toBe(Winner.PLAYER);
    expect(result!.rounds[1].playerPair).toBe(PairState.YES);
    // id / roundNumber preserved
    expect(result!.rounds[1].roundNumber).toBe(2);
    expect(result!.rounds[1].id).toBe(rounds[1].id);
    expect(result!.revision.action).toBe('UPDATE');
    expect(result!.revision.before).toContain('BANKER');
    expect(result!.revision.after).toContain('PLAYER');
  });

  it('delete removes a middle round and renumbers the remainder 1..n', () => {
    const rounds = shoeFrom([
      Winner.PLAYER,
      Winner.BANKER,
      Winner.TIE,
      Winner.PLAYER,
    ]);
    const result = deleteRound(rounds, 2, ctx(99));
    expect(result).not.toBeNull();
    expect(result!.rounds.map((r) => r.roundNumber)).toEqual([1, 2, 3]);
    expect(result!.rounds.map((r) => r.winner)).toEqual([
      Winner.PLAYER,
      Winner.TIE,
      Winner.PLAYER,
    ]);
    expect(result!.revision.action).toBe('DELETE');
  });

  it('delete of a missing round number returns null', () => {
    const rounds = shoeFrom([Winner.PLAYER]);
    expect(deleteRound(rounds, 5, ctx(99))).toBeNull();
  });
});

describe('history — full roadmap rebuild from raw rounds', () => {
  it('rebuilds the Big Road after editing a middle round', () => {
    const rounds = shoeFrom([Winner.PLAYER, Winner.PLAYER, Winner.BANKER]);
    const before = buildRoadmap(rounds);
    // Big Road: P,P down one column then B new column
    expect(before.bigRoad).toHaveLength(3);

    const edited = editRound(
      rounds,
      2,
      {
        winner: Winner.BANKER,
        playerPair: PairState.UNKNOWN,
        bankerPair: PairState.UNKNOWN,
      },
      ctx(99),
    )!.rounds;
    const after = buildRoadmap(edited);
    // Now P, B, B -> three cells but column structure differs (P col, then B col)
    expect(after.bigRoad.map((c) => c.winner)).toEqual([
      Winner.PLAYER,
      Winner.BANKER,
      Winner.BANKER,
    ]);
  });

  it('rebuilds a shorter Big Road after deleting a round', () => {
    const rounds = shoeFrom([Winner.PLAYER, Winner.BANKER, Winner.PLAYER]);
    const afterDelete = deleteRound(rounds, 3, ctx(99))!.rounds;
    const roadmap = buildRoadmap(afterDelete);
    expect(roadmap.bigRoad).toHaveLength(2);
    expect(roadmap.bigRoad.map((c) => c.winner)).toEqual([
      Winner.PLAYER,
      Winner.BANKER,
    ]);
  });

  it('is deterministic: rebuilding identical raw rounds yields identical output', () => {
    const rounds = shoeFrom([Winner.PLAYER, Winner.TIE, Winner.BANKER]);
    expect(buildRoadmap(rounds)).toEqual(buildRoadmap(rounds.slice()));
  });
});

describe('history — checkpoint cadence', () => {
  it('fires at 15, 20, 30 and every additional 10 rounds', () => {
    expect(isCheckpointRound(15)).toBe(true);
    expect(isCheckpointRound(20)).toBe(true);
    expect(isCheckpointRound(30)).toBe(true);
    expect(isCheckpointRound(40)).toBe(true);
    expect(isCheckpointRound(50)).toBe(true);
    expect(isCheckpointRound(120)).toBe(true);
  });

  it('does not fire on non-checkpoint rounds', () => {
    for (const n of [1, 10, 14, 16, 25, 31, 35, 45]) {
      expect(isCheckpointRound(n)).toBe(false);
    }
  });
});

describe('history — 8 non-Tie warm-up gate', () => {
  it('blocks forward modes until 8 non-Tie results exist', () => {
    // 7 non-Tie + ties should still be blocked
    const seven = shoeFrom([
      Winner.PLAYER,
      Winner.TIE,
      Winner.BANKER,
      Winner.PLAYER,
      Winner.TIE,
      Winner.BANKER,
      Winner.PLAYER,
      Winner.BANKER,
      Winner.PLAYER, // 7 non-tie so far? count below
    ]);
    // Count deliberately: P,B,P,B,P,B,P = 7 non-tie (2 ties interspersed)
    expect(canStartForwardModes(seven.slice(0, 8))).toBe(false);
    expect(nonTieResultsRemaining(seven.slice(0, 8))).toBeGreaterThan(0);
  });

  it('allows forward modes once 8 non-Tie results exist', () => {
    const winners: Winner[] = [];
    for (let i = 0; i < MIN_NON_TIE_RESULTS; i += 1) {
      winners.push(i % 2 === 0 ? Winner.PLAYER : Winner.BANKER);
    }
    const rounds = shoeFrom(winners);
    expect(canStartForwardModes(rounds)).toBe(true);
    expect(nonTieResultsRemaining(rounds)).toBe(0);
  });

  it('ties never count toward the warm-up requirement', () => {
    const rounds = shoeFrom([
      Winner.TIE,
      Winner.TIE,
      Winner.TIE,
      Winner.PLAYER,
    ]);
    const stats = computeStatistics(rounds);
    expect(stats.tieTotal).toBe(3);
    expect(stats.nonTieRounds).toBe(1);
    expect(canStartForwardModes(rounds)).toBe(false);
  });
});
