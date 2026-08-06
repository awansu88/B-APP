/**
 * PART A — Immutable ShoeStateSnapshot.
 *
 * A deterministic, reconstructable projection of a shoe at a decision point.
 * Raw rounds remain the only source of truth (Principle #1); this snapshot is
 * derived and immutable. **No future leakage:** a snapshot that predicts target
 * round N may only contain information from rounds strictly before N. Use
 * `snapshotForTargetRound` to enforce that slice.
 *
 * Pure TypeScript — no React/RN/Expo/SQLite/UI, no randomness, no I/O.
 */
import { Winner } from '../models/outcome';
import { PairState } from '../models/pair';
import type { RoundRecord } from '../models/round';
import { buildRoadmap } from '../roadmap/engine';
import type { RoadmapResult } from '../roadmap/types';
import { DerivedMark, BIG_ROAD_ROWS } from '../roadmap/types';
import {
  Run,
  Side,
  deepFreeze,
  lastN,
  nonTieWinners,
  toRuns,
} from '../analysis/helpers';

export const SNAPSHOT_VERSION = 'SNAPSHOT-001';

/** Trailing window of non-Tie winners retained on the snapshot. */
export const RECENT_NON_TIE_WINDOW = 12;

export interface StreakState {
  readonly side: Side | null;
  readonly length: number;
}

export interface BigRoadSnapshot {
  readonly columns: number;
  readonly currentColumn: number; // 0-based index of the active column
  readonly currentColumnHeight: number;
  readonly currentRow: number; // 0-based row within the visible 6-row grid
  readonly dragonTail: boolean; // current column exceeds the 6-row height
  readonly recentColumnHeights: readonly number[];
}

export interface DerivedRoadSnapshot {
  readonly available: boolean;
  readonly latestMark: DerivedMark | null;
  readonly currentRun: number;
  readonly length: number;
}

export interface DerivedRoadsSnapshot {
  readonly bigEyeBoy: DerivedRoadSnapshot;
  readonly smallRoad: DerivedRoadSnapshot;
  readonly cockroachPig: DerivedRoadSnapshot;
}

export interface DataQualitySnapshot {
  readonly winnerCompleteness: number; // 0..1
  readonly pairCompleteness: number; // 0..1
  readonly revisionCount: number;
  readonly missingRounds: number;
  readonly historyConfirmed: boolean;
}

export interface ShoeStateSnapshot {
  readonly snapshotVersion: string;
  readonly shoeId: string;
  /** The round this snapshot would predict (completedRounds + 1). */
  readonly targetRoundNumber: number;
  readonly completedRounds: number;
  readonly nonTieRounds: number;
  readonly playerCount: number;
  readonly bankerCount: number;
  readonly tieCount: number;
  readonly recentNonTieHistory: readonly Side[];
  readonly currentStreak: StreakState;
  readonly previousRun: Run | null;
  readonly bigRoad: BigRoadSnapshot;
  readonly derivedRoads: DerivedRoadsSnapshot;
  readonly dataQuality: DataQualitySnapshot;
}

export interface SnapshotOptions {
  /** Precomputed roadmap; rebuilt from `rounds` when omitted (deterministic). */
  readonly roadmap?: RoadmapResult;
  /** Number of audit revisions recorded for this shoe (data-quality signal). */
  readonly revisionCount?: number;
  /** Whether the operator has confirmed the history. */
  readonly historyConfirmed?: boolean;
  /** Override shoe id (defaults to the rounds' shoeId). */
  readonly shoeId?: string;
}

function derivedSnapshot(
  cells: readonly { readonly mark: DerivedMark }[],
): DerivedRoadSnapshot {
  if (cells.length === 0) {
    return { available: false, latestMark: null, currentRun: 0, length: 0 };
  }
  const latestMark = cells[cells.length - 1].mark;
  let run = 0;
  for (let i = cells.length - 1; i >= 0; i -= 1) {
    if (cells[i].mark === latestMark) run += 1;
    else break;
  }
  return { available: true, latestMark, currentRun: run, length: cells.length };
}

function bigRoadSnapshot(runs: readonly Run[]): BigRoadSnapshot {
  if (runs.length === 0) {
    return {
      columns: 0,
      currentColumn: -1,
      currentColumnHeight: 0,
      currentRow: -1,
      dragonTail: false,
      recentColumnHeights: [],
    };
  }
  const heights = runs.map((r) => r.length);
  const currentColumnHeight = heights[heights.length - 1];
  return {
    columns: runs.length,
    currentColumn: runs.length - 1,
    currentColumnHeight,
    currentRow: Math.min(currentColumnHeight, BIG_ROAD_ROWS) - 1,
    dragonTail: currentColumnHeight > BIG_ROAD_ROWS,
    recentColumnHeights: lastN(heights, 6),
  };
}

/**
 * Build an immutable snapshot from an ordered slice of raw rounds. The snapshot
 * describes the state AFTER `rounds` and predicts the next round.
 */
export function buildShoeStateSnapshot(
  rounds: readonly RoundRecord[],
  options: SnapshotOptions = {},
): ShoeStateSnapshot {
  const roadmap = options.roadmap ?? buildRoadmap(rounds.slice());
  const sides = nonTieWinners(rounds);
  const runs = toRuns(sides);

  let playerCount = 0;
  let bankerCount = 0;
  let tieCount = 0;
  let pairsKnown = 0;
  for (const r of rounds) {
    if (r.winner === Winner.PLAYER) playerCount += 1;
    else if (r.winner === Winner.BANKER) bankerCount += 1;
    else tieCount += 1;
    if (r.playerPair !== PairState.UNKNOWN && r.bankerPair !== PairState.UNKNOWN) {
      pairsKnown += 1;
    }
  }

  const currentRun = runs[runs.length - 1] ?? null;
  const previousRun = runs.length >= 2 ? runs[runs.length - 2] : null;

  const shoeId = options.shoeId ?? rounds[0]?.shoeId ?? '';

  const snapshot: ShoeStateSnapshot = {
    snapshotVersion: SNAPSHOT_VERSION,
    shoeId,
    targetRoundNumber: rounds.length + 1,
    completedRounds: rounds.length,
    nonTieRounds: sides.length,
    playerCount,
    bankerCount,
    tieCount,
    recentNonTieHistory: lastN(sides, RECENT_NON_TIE_WINDOW),
    currentStreak: currentRun
      ? { side: currentRun.side, length: currentRun.length }
      : { side: null, length: 0 },
    previousRun,
    bigRoad: bigRoadSnapshot(runs),
    derivedRoads: {
      bigEyeBoy: derivedSnapshot(roadmap.bigEyeBoy),
      smallRoad: derivedSnapshot(roadmap.smallRoad),
      cockroachPig: derivedSnapshot(roadmap.cockroachPig),
    },
    dataQuality: {
      winnerCompleteness: 1, // winner is always recorded for every round
      pairCompleteness: rounds.length === 0 ? 1 : pairsKnown / rounds.length,
      revisionCount: options.revisionCount ?? 0,
      missingRounds: 0, // rounds are always a contiguous 1..n sequence
      historyConfirmed: options.historyConfirmed ?? false,
    },
  };

  return deepFreeze(snapshot);
}

/**
 * Build the snapshot that predicts `targetRoundNumber`, using ONLY rounds that
 * occurred strictly before it (future-leakage prevention). Rounds after the
 * target are ignored even if supplied.
 */
export function snapshotForTargetRound(
  allRounds: readonly RoundRecord[],
  targetRoundNumber: number,
  options: SnapshotOptions = {},
): ShoeStateSnapshot {
  const priorRounds = allRounds.filter((r) => r.roundNumber < targetRoundNumber);
  // Roadmap must be rebuilt from the sliced rounds (never the caller's full one).
  const { roadmap: _ignored, ...rest } = options;
  void _ignored;
  return buildShoeStateSnapshot(priorRounds, rest);
}
