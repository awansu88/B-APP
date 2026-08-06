import { RoundSource } from '@/src/domain/models/enums';
import { Winner } from '@/src/domain/models/outcome';
import { PairState } from '@/src/domain/models/pair';
import type { RoundRecord } from '@/src/domain/models/round';
import { buildRoadmap } from '@/src/domain/roadmap/engine';
import { DerivedMark, RoadmapColor } from '@/src/domain/roadmap/types';

interface Spec {
  w: Winner;
  pp?: boolean;
  bp?: boolean;
}

const build = (specs: Spec[]): RoundRecord[] =>
  specs.map((s, i) => ({
    id: `r${i + 1}`,
    shoeId: 'shoe',
    roundNumber: i + 1,
    winner: s.w,
    playerPair: s.pp ? PairState.YES : PairState.NO,
    bankerPair: s.bp ? PairState.YES : PairState.NO,
    source: RoundSource.HISTORY,
    createdAt: '2026-01-01T00:00:00.000Z',
  }));

const P = (o: Partial<Spec> = {}): Spec => ({ w: Winner.PLAYER, ...o });
const B = (o: Partial<Spec> = {}): Spec => ({ w: Winner.BANKER, ...o });
const T = (o: Partial<Spec> = {}): Spec => ({ w: Winner.TIE, ...o });

const rc = (cells: { row: number; col: number }[]) =>
  cells.map((c) => [c.row, c.col]);

describe('roadmap engine — golden coordinate tests', () => {
  it('1. simple Player streak', () => {
    const r = buildRoadmap(build([P(), P(), P(), P()]));
    expect(rc(r.bigRoad)).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
    expect(r.bigRoad.every((c) => c.color === RoadmapColor.BLUE)).toBe(true);
    expect(r.leadingTieCount).toBe(0);
  });

  it('2. simple Banker streak', () => {
    const r = buildRoadmap(build([B(), B(), B(), B()]));
    expect(rc(r.bigRoad)).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
    expect(r.bigRoad.every((c) => c.color === RoadmapColor.RED)).toBe(true);
  });

  it('3. perfect chop', () => {
    const r = buildRoadmap(build([P(), B(), P(), B()]));
    expect(rc(r.bigRoad)).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ]);
    // Perfect chop => Big Eye Boy is all red.
    expect(r.bigEyeBoy.map((c) => c.mark)).toEqual([
      DerivedMark.RED,
      DerivedMark.RED,
    ]);
  });

  it('4. mixed singles and doubles', () => {
    const r = buildRoadmap(build([P(), P(), B(), P(), P(), B()]));
    expect(rc(r.bigRoad)).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
      [0, 2],
      [1, 2],
      [0, 3],
    ]);
  });

  it('5. more than six identical results (column fills then tails)', () => {
    const r = buildRoadmap(build(Array(7).fill(P())));
    expect(rc(r.bigRoad)).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [5, 0],
      [5, 1],
    ]);
  });

  it('6. dragon tail (eight identical continues right along row 5)', () => {
    const r = buildRoadmap(build(Array(8).fill(P())));
    expect(rc(r.bigRoad).slice(5)).toEqual([
      [5, 0],
      [5, 1],
      [5, 2],
    ]);
  });

  it('7. leading Tie is preserved and does not create a Big Road column', () => {
    const r = buildRoadmap(build([T(), P(), P()]));
    expect(r.leadingTieCount).toBe(1);
    expect(r.beadPlate).toHaveLength(3);
    expect(r.beadPlate[0].winner).toBe(Winner.TIE);
    expect(rc(r.bigRoad)).toEqual([
      [0, 0],
      [1, 0],
    ]);
  });

  it('8. multiple Tie after a result increments the tie count', () => {
    const r = buildRoadmap(build([P(), T(), T()]));
    expect(rc(r.bigRoad)).toEqual([[0, 0]]);
    expect(r.bigRoad[0].ties).toBe(2);
    expect(r.tieMarkers).toEqual([
      { roundId: 'r1', row: 0, col: 0, count: 2 },
    ]);
  });

  it('9. Tie between same-side results keeps the streak in one column', () => {
    const r = buildRoadmap(build([P(), T(), P()]));
    expect(rc(r.bigRoad)).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(r.bigRoad[0].ties).toBe(1);
  });

  it('10. Player Pair marker (blue, never shifts placement)', () => {
    const r = buildRoadmap(build([P({ pp: true }), B()]));
    expect(r.playerPairMarkers).toEqual([{ roundId: 'r1', row: 0, col: 0 }]);
    expect(r.bankerPairMarkers).toEqual([]);
    expect(rc(r.bigRoad)).toEqual([
      [0, 0],
      [0, 1],
    ]);
  });

  it('11. Banker Pair marker (red)', () => {
    const r = buildRoadmap(build([B({ bp: true })]));
    expect(r.bankerPairMarkers).toEqual([{ roundId: 'r1', row: 0, col: 0 }]);
    expect(r.playerPairMarkers).toEqual([]);
  });

  it('12. double pair (both markers on one result)', () => {
    const r = buildRoadmap(build([P({ pp: true, bp: true })]));
    expect(r.playerPairMarkers).toEqual([{ roundId: 'r1', row: 0, col: 0 }]);
    expect(r.bankerPairMarkers).toEqual([{ roundId: 'r1', row: 0, col: 0 }]);
  });

  it('13. pair on a Tie result does not affect placement', () => {
    const r = buildRoadmap(build([T({ pp: true }), P()]));
    expect(r.leadingTieCount).toBe(1);
    expect(r.playerPairMarkers).toEqual([{ roundId: 'r1', row: 0, col: 0 }]);
    expect(rc(r.bigRoad)).toEqual([[0, 0]]);
  });

  it('14. delete final round and rebuild equals building the shorter shoe', () => {
    const full = build([P(), P(), P(), P()]);
    const afterDelete = full.slice(0, 3);
    expect(buildRoadmap(afterDelete)).toEqual(buildRoadmap(build([P(), P(), P()])));
  });

  it('15. correct a middle round and rebuild deterministically', () => {
    const rounds = build([P(), P(), P()]);
    const corrected: RoundRecord[] = [
      rounds[0],
      { ...rounds[1], winner: Winner.BANKER },
      rounds[2],
    ];
    const rebuilt = buildRoadmap(corrected);
    expect(rc(rebuilt.bigRoad)).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
    ]);
    expect(rebuilt).toEqual(buildRoadmap(build([P(), B(), P()])));
  });

  it('16. repeated rebuild produces identical output', () => {
    const rounds = build([P(), B(), B(), T(), P(), P(), B()]);
    expect(buildRoadmap(rounds)).toEqual(buildRoadmap(rounds));
  });
});
