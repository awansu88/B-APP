/**
 * Milestone 6 — import/merge PLANNING (PURE, ZERO WRITES).
 *
 * Produces a deterministic merge plan + report by comparing an incoming export
 * against the existing dataset. It NEVER writes: native applies the plan
 * transactionally; web shows the plan as a preview only. This single module is
 * the shared source of merge rules for BOTH runtimes.
 *
 * MVP merge semantics:
 *   - identical id + identical content   -> duplicate (skip safely)
 *   - identical id + different content   -> conflict (never silently overwrite)
 *   - independent (new) id               -> import normally
 * Rounds additionally reject impossible duplicates (same shoe + round number,
 * different id). Locked predictions preserve the immutable payload and enforce
 * at most one VALID (non-invalidated) lock per shoe + target across the merged
 * result; invalidated historical entries may coexist.
 */
import type { RoundRecord } from '../models/round';
import type { RevisionRecord, ShoeRecord } from '../models/records';
import type { BappDataset, LockedPredictionEntryRecord, SessionStateRecord } from './dataset';
import type { BappExport } from './format';

export interface MergeConflict {
  readonly collection: string;
  readonly id: string;
  readonly reason: string;
}

export interface MergeInvalid {
  readonly collection: string;
  readonly id: string;
  readonly reason: string;
}

export interface MergeReport {
  readonly shoesRead: number;
  readonly shoesAdded: number;
  readonly roundsRead: number;
  readonly roundsAdded: number;
  readonly revisionsRead: number;
  readonly revisionsAdded: number;
  readonly predictionsRead: number;
  readonly predictionsAdded: number;
  readonly sessionStatesRead: number;
  readonly sessionStatesAdded: number;
  readonly duplicatesSkipped: number;
  readonly conflicts: readonly MergeConflict[];
  readonly invalidRecords: readonly MergeInvalid[];
}

export interface MergePlan {
  /** Records that would be inserted (safe additions only). */
  readonly toAdd: BappDataset;
  readonly report: MergeReport;
  /** True only when there are no conflicts and no invalid records. */
  readonly safe: boolean;
}

/** Deterministic canonical JSON (recursively sorted keys) for content equality. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
}

const eq = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);

/** Plan a merge of `incoming` into `existing`. Pure; performs no writes. */
export function planMerge(existing: BappDataset, incoming: BappExport): MergePlan {
  const conflicts: MergeConflict[] = [];
  const invalid: MergeInvalid[] = [];
  let duplicatesSkipped = 0;

  const data = incoming.data;

  // --- shoes ---------------------------------------------------------------
  const existingShoes = new Map(existing.shoes.map((s) => [s.id, s]));
  const shoesToAdd: ShoeRecord[] = [];
  const mergedShoeIds = new Set<string>(existingShoes.keys());
  for (const shoe of data.shoes) {
    const prior = existingShoes.get(shoe.id);
    if (prior) {
      if (eq(prior, shoe)) duplicatesSkipped += 1;
      else conflicts.push({ collection: 'shoes', id: shoe.id, reason: 'Same id, different content.' });
    } else {
      shoesToAdd.push(shoe);
      mergedShoeIds.add(shoe.id);
    }
  }

  // --- rounds --------------------------------------------------------------
  const existingRounds = new Map(existing.rounds.map((r) => [r.id, r]));
  const existingRoundKey = new Set(existing.rounds.map((r) => `${r.shoeId}::${r.roundNumber}`));
  const roundsToAdd: RoundRecord[] = [];
  for (const round of data.rounds) {
    const prior = existingRounds.get(round.id);
    const key = `${round.shoeId}::${round.roundNumber}`;
    if (prior) {
      if (eq(prior, round)) duplicatesSkipped += 1;
      else conflicts.push({ collection: 'rounds', id: round.id, reason: 'Same id, different content.' });
      continue;
    }
    if (!mergedShoeIds.has(round.shoeId)) {
      invalid.push({ collection: 'rounds', id: round.id, reason: `Unknown shoe ${round.shoeId}.` });
      continue;
    }
    if (existingRoundKey.has(key)) {
      conflicts.push({ collection: 'rounds', id: round.id, reason: `Different round already at ${key}.` });
      continue;
    }
    roundsToAdd.push(round);
    existingRoundKey.add(key);
  }

  // --- revisions -----------------------------------------------------------
  const existingRevisions = new Map(existing.revisions.map((r) => [r.id, r]));
  const revisionsToAdd: RevisionRecord[] = [];
  for (const rev of data.revisions) {
    const prior = existingRevisions.get(rev.id);
    if (prior) {
      if (eq(prior, rev)) duplicatesSkipped += 1;
      else conflicts.push({ collection: 'revisions', id: rev.id, reason: 'Same id, different content.' });
      continue;
    }
    if (!mergedShoeIds.has(rev.shoeId)) {
      invalid.push({ collection: 'revisions', id: rev.id, reason: `Unknown shoe ${rev.shoeId}.` });
      continue;
    }
    revisionsToAdd.push(rev);
  }

  // --- locked predictions --------------------------------------------------
  const existingLpe = new Map(existing.lockedPredictions.map((p) => [p.id, p]));
  const validTargets = new Set(
    existing.lockedPredictions.filter((p) => !p.invalidated).map((p) => `${p.shoeId}::${p.targetRoundNumber}`),
  );
  const lpeToAdd: LockedPredictionEntryRecord[] = [];
  for (const p of data.lockedPredictions) {
    const prior = existingLpe.get(p.id);
    if (prior) {
      if (eq(prior, p)) duplicatesSkipped += 1;
      else conflicts.push({ collection: 'lockedPredictions', id: p.id, reason: 'Same id, different content.' });
      continue;
    }
    if (!mergedShoeIds.has(p.shoeId)) {
      invalid.push({ collection: 'lockedPredictions', id: p.id, reason: `Unknown shoe ${p.shoeId}.` });
      continue;
    }
    const key = `${p.shoeId}::${p.targetRoundNumber}`;
    if (!p.invalidated) {
      if (validTargets.has(key)) {
        conflicts.push({
          collection: 'lockedPredictions',
          id: p.id,
          reason: `A valid locked prediction already exists for ${key}.`,
        });
        continue;
      }
      validTargets.add(key);
    }
    lpeToAdd.push(p);
  }

  // --- session states (keyed by shoeId) ------------------------------------
  const existingSessions = new Map(existing.sessionStates.map((s) => [s.shoeId, s]));
  const sessionsToAdd: SessionStateRecord[] = [];
  for (const s of data.sessionStates) {
    const prior = existingSessions.get(s.shoeId);
    if (prior) {
      if (eq(prior, s)) duplicatesSkipped += 1;
      else conflicts.push({ collection: 'sessionStates', id: s.shoeId, reason: 'Same shoe, different content.' });
      continue;
    }
    if (!mergedShoeIds.has(s.shoeId)) {
      invalid.push({ collection: 'sessionStates', id: s.shoeId, reason: `Unknown shoe ${s.shoeId}.` });
      continue;
    }
    sessionsToAdd.push(s);
  }

  const report: MergeReport = {
    shoesRead: data.shoes.length,
    shoesAdded: shoesToAdd.length,
    roundsRead: data.rounds.length,
    roundsAdded: roundsToAdd.length,
    revisionsRead: data.revisions.length,
    revisionsAdded: revisionsToAdd.length,
    predictionsRead: data.lockedPredictions.length,
    predictionsAdded: lpeToAdd.length,
    sessionStatesRead: data.sessionStates.length,
    sessionStatesAdded: sessionsToAdd.length,
    duplicatesSkipped,
    conflicts,
    invalidRecords: invalid,
  };

  return {
    toAdd: {
      shoes: shoesToAdd,
      rounds: roundsToAdd,
      revisions: revisionsToAdd,
      lockedPredictions: lpeToAdd,
      sessionStates: sessionsToAdd,
    },
    report,
    safe: conflicts.length === 0 && invalid.length === 0,
  };
}
