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

// Literal, independently hand-computed derived-road fixtures. Expected values
// below were traced by hand from the documented algorithm — never generated by
// calling buildRoadmap or another implementation.
const RED = DerivedMark.RED;
const BLUE = DerivedMark.BLUE;

describe('derived roads — golden coordinates & structural colours', () => {
  it('Big Eye Boy first activation point (needs a 3rd logical column)', () => {
    // P B -> only 2 columns -> no Big Eye Boy yet.
    expect(buildRoadmap(build([P(), B()])).bigEyeBoy).toEqual([]);
    // P B P -> first mark appears at the top of column 3.
    expect(buildRoadmap(build([P(), B(), P()])).bigEyeBoy).toEqual([
      { row: 0, col: 0, mark: RED },
    ]);
  });

  it('Small Road first activation point', () => {
    // P B P -> not enough for Small Road.
    expect(buildRoadmap(build([P(), B(), P()])).smallRoad).toEqual([]);
    // P B P P -> first Small Road mark.
    expect(buildRoadmap(build([P(), B(), P(), P()])).smallRoad).toEqual([
      { row: 0, col: 0, mark: BLUE },
    ]);
  });

  it('Cockroach Pig first activation point', () => {
    // P B P B -> not enough for Cockroach Pig.
    expect(buildRoadmap(build([P(), B(), P(), B()])).cockroachPig).toEqual([]);
    // P B P B B -> first Cockroach Pig mark.
    expect(buildRoadmap(build([P(), B(), P(), B(), B()])).cockroachPig).toEqual([
      { row: 0, col: 0, mark: BLUE },
    ]);
  });

  it('stable structural-RED run with derived dragon tail (heights 3,3,3,3,3)', () => {
    const beads = [
      ...Array(3).fill(P()),
      ...Array(3).fill(B()),
      ...Array(3).fill(P()),
      ...Array(3).fill(B()),
      ...Array(3).fill(P()),
    ];
    const r = buildRoadmap(build(beads));
    expect(r.bigEyeBoy).toEqual([
      { row: 0, col: 0, mark: RED },
      { row: 1, col: 0, mark: RED },
      { row: 2, col: 0, mark: RED },
      { row: 3, col: 0, mark: RED },
      { row: 4, col: 0, mark: RED },
      { row: 5, col: 0, mark: RED },
      { row: 5, col: 1, mark: RED },
      { row: 5, col: 2, mark: RED },
      { row: 5, col: 3, mark: RED },
      { row: 5, col: 4, mark: RED },
      { row: 5, col: 5, mark: RED },
    ]);
  });

  it('stable structural-BLUE run (heights 1,1,4)', () => {
    const r = buildRoadmap(build([P(), B(), P(), P(), P(), P()]));
    expect(r.bigEyeBoy).toEqual([
      { row: 0, col: 0, mark: RED },
      { row: 0, col: 1, mark: BLUE },
      { row: 1, col: 1, mark: BLUE },
      { row: 2, col: 1, mark: BLUE },
    ]);
  });

  it('structural colour transition across all three derived roads (heights 1,1,1,2,1)', () => {
    const r = buildRoadmap(build([P(), B(), P(), B(), B(), P()]));
    expect(r.bigEyeBoy).toEqual([
      { row: 0, col: 0, mark: RED },
      { row: 1, col: 0, mark: RED },
      { row: 0, col: 1, mark: BLUE },
      { row: 1, col: 1, mark: BLUE },
    ]);
    expect(r.smallRoad).toEqual([
      { row: 0, col: 0, mark: RED },
      { row: 0, col: 1, mark: BLUE },
      { row: 1, col: 1, mark: BLUE },
    ]);
    expect(r.cockroachPig).toEqual([
      { row: 0, col: 0, mark: BLUE },
      { row: 1, col: 0, mark: BLUE },
    ]);
  });

  it('big-road dragon-tail interaction uses logical column height (heights 1,7)', () => {
    const r = buildRoadmap(build([P(), ...Array(7).fill(B())]));
    expect(r.bigEyeBoy).toEqual([
      { row: 0, col: 0, mark: BLUE },
      { row: 1, col: 0, mark: BLUE },
      { row: 2, col: 0, mark: BLUE },
      { row: 3, col: 0, mark: BLUE },
      { row: 4, col: 0, mark: BLUE },
      { row: 5, col: 0, mark: BLUE },
    ]);
  });

  it('deterministic rebuild after editing a middle round (derived output)', () => {
    const base = build([P(), B(), P(), B(), B(), P()]);
    // Correct round 5 from BANKER to PLAYER, then rebuild.
    const edited: RoundRecord[] = base.map((r) =>
      r.roundNumber === 5 ? { ...r, winner: Winner.PLAYER } : r,
    );
    const rebuilt = buildRoadmap(edited);
    expect(rebuilt.bigEyeBoy).toEqual([
      { row: 0, col: 0, mark: RED },
      { row: 1, col: 0, mark: RED },
      { row: 2, col: 0, mark: RED },
      { row: 0, col: 1, mark: BLUE },
    ]);
    // And rebuilding the same edited input twice is byte-equivalent.
    expect(buildRoadmap(edited)).toEqual(rebuilt);
  });

  it('derived roads use a dedicated structural enum (RED != BANKER, BLUE != PLAYER)', () => {
    expect(Object.values(DerivedMark)).toEqual(['RED', 'BLUE']);
    const r = buildRoadmap(build([P(), B(), P(), B(), B(), P()]));
    const marks = [...r.bigEyeBoy, ...r.smallRoad, ...r.cockroachPig].map(
      (c) => c.mark,
    );
    for (const m of marks) {
      expect([DerivedMark.RED, DerivedMark.BLUE]).toContain(m);
      expect(m).not.toBe(Winner.PLAYER);
      expect(m).not.toBe(Winner.BANKER);
    }
  });
});

describe('roadmap — raw rounds are the only source of truth', () => {
  it('rebuilds the full roadmap purely from raw rounds (no stored roadmap JSON)', () => {
    // buildRoadmap takes ONLY raw RoundRecords — it cannot read snapshots.
    const specs = [P(), B(), B(), T({ pp: true }), P(), P(), B()];
    const first = buildRoadmap(build(specs));

    // A completely fresh set of raw rounds, provided out of order, rebuilds the
    // identical roadmap — proving reconstruction depends on raw rounds alone.
    const shuffled = [...build(specs)].reverse();
    const rebuilt = buildRoadmap(shuffled);

    expect(rebuilt).toEqual(first);
    // The result object carries no persisted roadmap/feature JSON field.
    expect(Object.keys(first)).toEqual([
      'beadPlate',
      'bigRoad',
      'bigEyeBoy',
      'smallRoad',
      'cockroachPig',
      'tieMarkers',
      'playerPairMarkers',
      'bankerPairMarkers',
      'leadingTieCount',
    ]);
  });
});
