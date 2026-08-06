import { Winner } from '../models/outcome';

/** Both the Bead Plate and the Big Road use a fixed height of 6 rows. */
export const BEAD_PLATE_ROWS = 6;
export const BIG_ROAD_ROWS = 6;

/**
 * UI colour model. PLAYER = blue, BANKER = red, TIE = green. This is a
 * *presentation* mapping only; the source of truth remains the `Winner` enum.
 */
export enum RoadmapColor {
  BLUE = 'BLUE',
  RED = 'RED',
  GREEN = 'GREEN',
}

/**
 * Structural derived-road mark. RED/BLUE here are NOT sides — derived red must
 * never be stored as BANKER and derived blue must never be stored as PLAYER.
 */
export enum DerivedMark {
  RED = 'RED',
  BLUE = 'BLUE',
}

/** A Bead Plate cell — every round (including ties) is placed here. */
export interface BeadPlateCell {
  readonly index: number;
  readonly row: number;
  readonly col: number;
  readonly winner: Winner;
  readonly color: RoadmapColor;
  readonly playerPair: boolean;
  readonly bankerPair: boolean;
  readonly roundId: string;
}

/** A Big Road logical cell — only PLAYER/BANKER results occupy the grid. */
export interface BigRoadCell {
  readonly row: number;
  readonly col: number;
  readonly winner: Winner; // PLAYER or BANKER only
  readonly color: RoadmapColor; // BLUE or RED only
  /** Number of ties recorded on this result. */
  readonly ties: number;
  readonly playerPair: boolean;
  readonly bankerPair: boolean;
  readonly roundId: string;
}

/** A derived-road cell (Big Eye Boy / Small Road / Cockroach Pig). */
export interface DerivedCell {
  readonly row: number;
  readonly col: number;
  readonly mark: DerivedMark;
}

/** A pair marker positioned on a Bead Plate cell (placement never shifts). */
export interface PairMarker {
  readonly roundId: string;
  readonly row: number;
  readonly col: number;
}

/** A tie marker attached to a Big Road cell (with a running count). */
export interface TieMarker {
  readonly roundId: string;
  readonly row: number;
  readonly col: number;
  readonly count: number;
}

/** The complete, deterministic roadmap reconstruction. */
export interface RoadmapResult {
  readonly beadPlate: BeadPlateCell[];
  readonly bigRoad: BigRoadCell[];
  readonly bigEyeBoy: DerivedCell[];
  readonly smallRoad: DerivedCell[];
  readonly cockroachPig: DerivedCell[];
  readonly tieMarkers: TieMarker[];
  readonly playerPairMarkers: PairMarker[];
  readonly bankerPairMarkers: PairMarker[];
  /** Ties occurring before the first PLAYER/BANKER result (never discarded). */
  readonly leadingTieCount: number;
}
