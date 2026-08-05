import {
  BEAD_PLATE_ROWS,
  countNonTie,
  isWarmedUp,
  reconstructBeadPlate,
} from '@/src/domain/roadmap/beadPlate';
import { ROADMAP_VERSION } from '@/src/domain/roadmap';
import { Outcome } from '@/src/domain/models/outcome';
import { PairStatus } from '@/src/domain/models/pair';
import type { RoundRecord } from '@/src/domain/models/round';

const makeRound = (index: number, outcome: Outcome): RoundRecord => ({
  id: `r${index}`,
  shoeId: 'shoe-1',
  index,
  outcome,
  playerPair: PairStatus.UNKNOWN,
  bankerPair: PairStatus.UNKNOWN,
  createdAt: '2026-01-01T00:00:00.000Z',
});

describe('roadmap — bead plate reconstruction (ROADMAP-001)', () => {
  it('carries the locked roadmap version', () => {
    expect(ROADMAP_VERSION).toBe('ROADMAP-001');
  });

  it('reconstructs a column-major 6-row bead plate purely from raw rounds', () => {
    const rounds = [
      makeRound(0, Outcome.PLAYER),
      makeRound(1, Outcome.BANKER),
      makeRound(2, Outcome.TIE),
      makeRound(3, Outcome.PLAYER),
      makeRound(4, Outcome.BANKER),
      makeRound(5, Outcome.PLAYER),
      makeRound(6, Outcome.BANKER),
    ];

    const cells = reconstructBeadPlate(rounds);

    expect(BEAD_PLATE_ROWS).toBe(6);
    expect(cells).toHaveLength(7);
    // First cell.
    expect(cells[0]).toMatchObject({ row: 0, col: 0, outcome: Outcome.PLAYER });
    // Last cell of the first column.
    expect(cells[5]).toMatchObject({ row: 5, col: 0, outcome: Outcome.PLAYER });
    // Wraps into the second column.
    expect(cells[6]).toMatchObject({ row: 0, col: 1, outcome: Outcome.BANKER });
  });

  it('is order-independent (reconstructable from unordered raw rounds)', () => {
    const ordered = [
      makeRound(0, Outcome.PLAYER),
      makeRound(1, Outcome.BANKER),
      makeRound(2, Outcome.PLAYER),
    ];
    const shuffled = [ordered[2], ordered[0], ordered[1]];
    expect(reconstructBeadPlate(shuffled)).toEqual(reconstructBeadPlate(ordered));
  });

  it('counts non-Tie results and enforces the 8-result warm-up', () => {
    const rounds = [
      makeRound(0, Outcome.PLAYER),
      makeRound(1, Outcome.TIE),
      makeRound(2, Outcome.BANKER),
      makeRound(3, Outcome.PLAYER),
      makeRound(4, Outcome.BANKER),
      makeRound(5, Outcome.PLAYER),
      makeRound(6, Outcome.BANKER),
    ];
    expect(countNonTie(rounds)).toBe(6);
    expect(isWarmedUp(rounds)).toBe(false);

    const warmed = [
      ...rounds,
      makeRound(7, Outcome.PLAYER),
      makeRound(8, Outcome.BANKER),
    ];
    expect(countNonTie(warmed)).toBe(8);
    expect(isWarmedUp(warmed)).toBe(true);
  });
});
