/**
 * Pure analysis helpers (no React/RN/Expo/SQLite/UI, no randomness, no I/O).
 * Deterministic building blocks shared by snapshots, features, and analyzers.
 */
import { Winner } from '../models/outcome';
import type { RoundRecord } from '../models/round';

/** A PLAYER or BANKER side (Tie is never a side). */
export type Side = Winner.PLAYER | Winner.BANKER;

export const isSide = (w: Winner): w is Side => w !== Winner.TIE;

/** The opposite non-Tie side. */
export const opposite = (side: Side): Side =>
  side === Winner.PLAYER ? Winner.BANKER : Winner.PLAYER;

/** Ordered PLAYER/BANKER winners (ties removed) from raw rounds. */
export function nonTieWinners(rounds: readonly RoundRecord[]): Side[] {
  const out: Side[] = [];
  for (const r of rounds) if (isSide(r.winner)) out.push(r.winner);
  return out;
}

/** A maximal run of one side within a non-Tie sequence. */
export interface Run {
  readonly side: Side;
  readonly length: number;
}

/** Split a non-Tie sequence into consecutive same-side runs (Big Road columns). */
export function toRuns(sides: readonly Side[]): Run[] {
  const runs: Run[] = [];
  for (const side of sides) {
    const last = runs[runs.length - 1];
    if (last && last.side === side) {
      runs[runs.length - 1] = { side, length: last.length + 1 };
    } else {
      runs.push({ side, length: 1 });
    }
  }
  return runs;
}

/** Last `n` items of an array (or fewer). */
export function lastN<T>(arr: readonly T[], n: number): T[] {
  return n <= 0 ? [] : arr.slice(Math.max(0, arr.length - n));
}

/** Safe ratio a/b, returning 0 when b === 0. */
export function ratio(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

/** Round to 6 decimals for stable, deterministic feature values. */
export function round6(x: number): number {
  return Math.round((x + Number.EPSILON) * 1e6) / 1e6;
}

/** Population variance of a numeric list (0 when empty/one element). */
export function variance(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const sq = values.reduce((s, v) => s + (v - mean) * (v - mean), 0);
  return sq / values.length;
}

/**
 * Alternation rate of a non-Tie sequence: fraction of adjacent pairs that
 * switch side (1 = perfect chop, 0 = one long streak). 0 when < 2 elements.
 */
export function alternationRate(sides: readonly Side[]): number {
  if (sides.length < 2) return 0;
  let switches = 0;
  for (let i = 1; i < sides.length; i += 1) {
    if (sides[i] !== sides[i - 1]) switches += 1;
  }
  return switches / (sides.length - 1);
}

/** Length of the trailing alternation run (…ABAB ends with how many switches). */
export function currentAlternationRun(sides: readonly Side[]): number {
  if (sides.length < 2) return sides.length;
  let run = 1;
  for (let i = sides.length - 1; i >= 1; i -= 1) {
    if (sides[i] !== sides[i - 1]) run += 1;
    else break;
  }
  return run;
}

/** Longest alternation run anywhere in the sequence. */
export function longestAlternationRun(sides: readonly Side[]): number {
  if (sides.length === 0) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < sides.length; i += 1) {
    if (sides[i] !== sides[i - 1]) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  return best;
}

/** Recursively freeze an object graph, returning the same (now immutable) value. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}
