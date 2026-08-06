/**
 * Pure TypeScript roadmap engine.
 *
 * MUST NOT import React, React Native, Expo, SQLite, or any UI component.
 * Input:  an ordered array of raw RoundRecords.
 * Output: a fully deterministic RoadmapResult (Bead Plate, Big Road, the three
 *         derived roads, tie/pair markers and the leading-tie count).
 *
 * Editing any round and re-running `buildRoadmap` yields a complete,
 * deterministic rebuild (Project Principle #2).
 */
import { PairState } from '../models/pair';
import { Winner } from '../models/outcome';
import type { RoundRecord } from '../models/round';

import {
  BIG_ROAD_ROWS,
  BeadPlateCell,
  BigRoadCell,
  DerivedCell,
  DerivedMark,
  PairMarker,
  RoadmapColor,
  RoadmapResult,
  TieMarker,
} from './types';

const BEAD_PLATE_ROWS = 6;

const colorForWinner = (winner: Winner): RoadmapColor => {
  switch (winner) {
    case Winner.PLAYER:
      return RoadmapColor.BLUE;
    case Winner.BANKER:
      return RoadmapColor.RED;
    default:
      return RoadmapColor.GREEN;
  }
};

interface GridPosition {
  row: number;
  col: number;
}

/**
 * Place a sequence of "sides" onto a 6-row grid using Big-Road rules:
 * same side moves down; when the column is full (or blocked) it dragon-tails to
 * the right on the same row; a different side starts a new column.
 */
function packSides(sides: readonly string[]): GridPosition[] {
  const occupied = new Set<string>();
  const key = (r: number, c: number) => `${r},${c}`;
  const positions: GridPosition[] = [];

  let prev: string | null = null;
  let columnStart = 0;
  let row = 0;
  let col = 0;

  sides.forEach((side, index) => {
    if (index === 0) {
      row = 0;
      col = 0;
      columnStart = 0;
    } else if (side === prev) {
      if (row + 1 < BIG_ROAD_ROWS && !occupied.has(key(row + 1, col))) {
        row += 1;
      } else {
        // Dragon tail: move right along the same row to the next free cell.
        let c = col + 1;
        while (occupied.has(key(row, c))) c += 1;
        col = c;
      }
    } else {
      // New column: to the right of this streak's starting column.
      let c = columnStart + 1;
      while (occupied.has(key(0, c))) c += 1;
      col = c;
      columnStart = c;
      row = 0;
    }

    occupied.add(key(row, col));
    positions.push({ row, col });
    prev = side;
  });

  return positions;
}

interface Bead {
  winner: Winner; // PLAYER or BANKER
  ties: number;
  playerPair: boolean;
  bankerPair: boolean;
  roundId: string;
}

/** Logical column heights (run lengths) — used for the derived roads. */
function logicalColumnHeights(beads: readonly Bead[]): number[] {
  const heights: number[] = [];
  let prev: Winner | null = null;
  beads.forEach((bead) => {
    if (bead.winner === prev) {
      heights[heights.length - 1] += 1;
    } else {
      heights.push(1);
      prev = bead.winner;
    }
  });
  return heights;
}

/**
 * Generate structural RED/BLUE marks for a derived road with the given offset
 * (Big Eye Boy = 1, Small Road = 2, Cockroach Pig = 3), using the standard
 * column-comparison algorithm over the Big Road's logical column heights.
 */
function deriveMarks(heights: readonly number[], offset: number): DerivedMark[] {
  const marks: DerivedMark[] = [];

  // Walk every logical cell (column k, row r) in reading order.
  for (let k = 0; k < heights.length; k += 1) {
    for (let r = 0; r < heights[k]; r += 1) {
      // Only start once enough columns exist to compare.
      if (r === 0) {
        // New column: compare the previous column with the one `offset` before it.
        const prevCol = k - 1;
        const compareCol = k - 1 - offset;
        if (compareCol < 0) continue;
        marks.push(
          heights[prevCol] === heights[compareCol]
            ? DerivedMark.RED
            : DerivedMark.BLUE,
        );
      } else {
        // Continuing a column: compare against the column `offset` to the left.
        const compareCol = k - offset;
        if (compareCol < 0) continue;
        marks.push(
          heights[compareCol] >= r + 1 ? DerivedMark.RED : DerivedMark.BLUE,
        );
      }
    }
  }

  return marks;
}

function packDerived(marks: readonly DerivedMark[]): DerivedCell[] {
  const positions = packSides(marks as readonly string[]);
  return marks.map((mark, i) => ({
    row: positions[i].row,
    col: positions[i].col,
    mark,
  }));
}

/** Build the complete roadmap from an ordered array of raw rounds. */
export function buildRoadmap(rounds: readonly RoundRecord[]): RoadmapResult {
  // Deterministic ordering by round number (defensive — enables rebuilds).
  const ordered = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber);

  // --- Bead Plate: every round (including ties). ---
  const beadPlate: BeadPlateCell[] = ordered.map((round, index) => ({
    index,
    row: index % BEAD_PLATE_ROWS,
    col: Math.floor(index / BEAD_PLATE_ROWS),
    winner: round.winner,
    color: colorForWinner(round.winner),
    playerPair: round.playerPair === PairState.YES,
    bankerPair: round.bankerPair === PairState.YES,
    roundId: round.id,
  }));

  // --- Beads (PLAYER/BANKER only) + tie accounting. ---
  const beads: Bead[] = [];
  let leadingTieCount = 0;

  ordered.forEach((round) => {
    if (round.winner === Winner.TIE) {
      if (beads.length === 0) {
        leadingTieCount += 1;
      } else {
        beads[beads.length - 1].ties += 1;
      }
      return;
    }
    beads.push({
      winner: round.winner,
      ties: 0,
      playerPair: round.playerPair === PairState.YES,
      bankerPair: round.bankerPair === PairState.YES,
      roundId: round.id,
    });
  });

  // --- Big Road placement. ---
  const positions = packSides(beads.map((b) => b.winner));
  const bigRoad: BigRoadCell[] = beads.map((bead, i) => ({
    row: positions[i].row,
    col: positions[i].col,
    winner: bead.winner,
    color: colorForWinner(bead.winner),
    ties: bead.ties,
    playerPair: bead.playerPair,
    bankerPair: bead.bankerPair,
    roundId: bead.roundId,
  }));

  // --- Tie markers (attached to their Big Road cell). ---
  const tieMarkers: TieMarker[] = bigRoad
    .filter((cell) => cell.ties > 0)
    .map((cell) => ({
      roundId: cell.roundId,
      row: cell.row,
      col: cell.col,
      count: cell.ties,
    }));

  // --- Pair markers (positioned on Bead Plate cells; never shift placement). ---
  const playerPairMarkers: PairMarker[] = [];
  const bankerPairMarkers: PairMarker[] = [];
  beadPlate.forEach((cell) => {
    if (cell.playerPair) {
      playerPairMarkers.push({ roundId: cell.roundId, row: cell.row, col: cell.col });
    }
    if (cell.bankerPair) {
      bankerPairMarkers.push({ roundId: cell.roundId, row: cell.row, col: cell.col });
    }
  });

  // --- Derived roads. ---
  const heights = logicalColumnHeights(beads);
  const bigEyeBoy = packDerived(deriveMarks(heights, 1));
  const smallRoad = packDerived(deriveMarks(heights, 2));
  const cockroachPig = packDerived(deriveMarks(heights, 3));

  return {
    beadPlate,
    bigRoad,
    bigEyeBoy,
    smallRoad,
    cockroachPig,
    tieMarkers,
    playerPairMarkers,
    bankerPairMarkers,
    leadingTieCount,
  };
}
