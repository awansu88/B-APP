/**
 * Pure, deterministic mutations over the raw ordered `RoundRecord[]` — the only
 * source of truth (Project Principle #1). Every mutation returns the NEW ordered
 * rounds array plus the audit `RevisionRecord` describing the change.
 *
 * No React / RN / Expo / SQLite / UI imports. Roadmaps are never mutated here;
 * they are always rebuilt from these rounds by `buildRoadmap` (Principle #2).
 */
import { RoundSource } from '../models/enums';
import { Winner } from '../models/outcome';
import { PairState } from '../models/pair';
import type { RoundRecord } from '../models/round';
import type { RevisionRecord } from '../models/records';

/** Context supplying the caller-controlled id + timestamp (keeps this pure). */
export interface MutationContext {
  /** ISO-8601 timestamp for the created round and/or revision. */
  readonly now: string;
  /** A unique id to use for a newly created round. */
  readonly newRoundId: string;
}

export interface MutationResult {
  readonly rounds: readonly RoundRecord[];
  readonly revision: RevisionRecord;
}

/** The editable fields of a round (roundNumber/id/order never change on edit). */
export interface RoundEdit {
  readonly winner: Winner;
  readonly playerPair: PairState;
  readonly bankerPair: PairState;
}

const revisionId = (shoeId: string, action: string, roundId: string): string =>
  `rev-${shoeId}-${roundId}-${action.toLowerCase()}`;

/**
 * Append a new result as the next round (1-based `roundNumber = length + 1`).
 * Produces an INSERT revision.
 */
export function appendRound(
  rounds: readonly RoundRecord[],
  shoeId: string,
  winner: Winner,
  playerPair: PairState,
  bankerPair: PairState,
  source: RoundSource,
  ctx: MutationContext,
): MutationResult {
  const roundNumber = rounds.length + 1;
  const round: RoundRecord = {
    id: ctx.newRoundId,
    shoeId,
    roundNumber,
    winner,
    playerPair,
    bankerPair,
    source,
    createdAt: ctx.now,
  };
  const revision: RevisionRecord = {
    id: revisionId(shoeId, 'insert', round.id),
    shoeId,
    roundNumber,
    action: 'INSERT',
    before: null,
    after: JSON.stringify(round),
    createdAt: ctx.now,
  };
  return { rounds: [...rounds, round], revision };
}

/**
 * Remove the most recent round (Undo). Returns `null` when there is nothing to
 * undo. Produces a DELETE revision for the removed round.
 */
export function undoLast(
  rounds: readonly RoundRecord[],
  ctx: MutationContext,
): MutationResult | null {
  if (rounds.length === 0) return null;
  const removed = rounds[rounds.length - 1];
  const revision: RevisionRecord = {
    id: revisionId(removed.shoeId, 'undo', removed.id),
    shoeId: removed.shoeId,
    roundNumber: removed.roundNumber,
    action: 'DELETE',
    before: JSON.stringify(removed),
    after: null,
    createdAt: ctx.now,
  };
  return { rounds: rounds.slice(0, -1), revision };
}

/**
 * Edit a historical round in place (winner and/or pair states). The round's id,
 * order and `roundNumber` are preserved. Produces an UPDATE revision holding the
 * before/after snapshots. Returns `null` if `roundNumber` is not found.
 */
export function editRound(
  rounds: readonly RoundRecord[],
  roundNumber: number,
  edit: RoundEdit,
  ctx: MutationContext,
): MutationResult | null {
  const index = rounds.findIndex((r) => r.roundNumber === roundNumber);
  if (index === -1) return null;

  const before = rounds[index];
  const after: RoundRecord = {
    ...before,
    winner: edit.winner,
    playerPair: edit.playerPair,
    bankerPair: edit.bankerPair,
  };
  const next = rounds.slice();
  next[index] = after;

  const revision: RevisionRecord = {
    id: revisionId(before.shoeId, 'update', before.id),
    shoeId: before.shoeId,
    roundNumber,
    action: 'UPDATE',
    before: JSON.stringify(before),
    after: JSON.stringify(after),
    createdAt: ctx.now,
  };
  return { rounds: next, revision };
}

/**
 * Delete a (possibly middle) round and RENUMBER the remaining rounds to a
 * contiguous 1..n sequence so the ordered array stays canonical. Round ids are
 * preserved; only `roundNumber` is reassigned. Produces a DELETE revision.
 * Returns `null` if `roundNumber` is not found.
 */
export function deleteRound(
  rounds: readonly RoundRecord[],
  roundNumber: number,
  ctx: MutationContext,
): MutationResult | null {
  const index = rounds.findIndex((r) => r.roundNumber === roundNumber);
  if (index === -1) return null;

  const removed = rounds[index];
  const next = rounds
    .filter((r) => r.roundNumber !== roundNumber)
    .map((r, i) => (r.roundNumber === i + 1 ? r : { ...r, roundNumber: i + 1 }));

  const revision: RevisionRecord = {
    id: revisionId(removed.shoeId, 'delete', removed.id),
    shoeId: removed.shoeId,
    roundNumber,
    action: 'DELETE',
    before: JSON.stringify(removed),
    after: null,
    createdAt: ctx.now,
  };
  return { rounds: next, revision };
}
