/**
 * Milestone 6 — export validation (PURE, ZERO WRITES).
 *
 * Rejects malformed/unsupported exports BEFORE any import/merge/restore. Shared
 * by web (validate + merge preview) and native (validate + transactional apply)
 * so validation rules are never duplicated.
 */
import { PredictionCategory, PredictionDecision, ShoeStatus } from '../models/enums';
import { SessionEnvironment } from '../session/environment';
import { PairState } from '../models/pair';
import { Winner } from '../models/outcome';
import { StepResult } from '../session';
import {
  BAPP_EXPORT_FORMAT,
  SUPPORTED_EXPORT_VERSIONS,
  type ExportCounts,
  type ExportKind,
} from './format';

export interface ValidationIssue {
  readonly code: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly errors: readonly ValidationIssue[];
  readonly warnings: readonly ValidationIssue[];
  readonly kind: ExportKind | null;
  readonly counts: ExportCounts | null;
}

const REQUIRED_COLLECTIONS: Readonly<Record<ExportKind, readonly string[]>> = {
  FULL_BACKUP: ['shoes', 'rounds', 'revisions', 'lockedPredictions', 'sessionStates'],
  HISTORY: ['shoes', 'rounds', 'revisions'],
  ANALYSIS: ['shoes', 'lockedPredictions'],
};

const winnerSet = new Set<string>(Object.values(Winner));
const decisionSet = new Set<string>(Object.values(PredictionDecision));
const categorySet = new Set<string>(Object.values(PredictionCategory));
const evaluationSet = new Set<string>(Object.values(StepResult));
const pairSet = new Set<string>(Object.values(PairState));
const shoeStatusSet = new Set<string>(Object.values(ShoeStatus));
const environmentSet = new Set<string>(Object.values(SessionEnvironment));
const actionSet = new Set<string>(['INSERT', 'UPDATE', 'DELETE']);
const operatorSet = new Set<string>(['UNSET', 'PLAYED', 'NOT_PLAYED']);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const nonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** Validate an untrusted parsed export. Never writes. */
export function validateExport(raw: unknown): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const err = (code: string, message: string) => errors.push({ code, message });

  if (!isObject(raw) || !isObject(raw.meta) || !isObject(raw.data)) {
    return {
      ok: false,
      errors: [{ code: 'MALFORMED', message: 'Not a recognized B-APP export object.' }],
      warnings,
      kind: null,
      counts: null,
    };
  }

  const meta = raw.meta as Record<string, unknown>;
  const data = raw.data as Record<string, unknown>;

  if (meta.format !== BAPP_EXPORT_FORMAT) {
    err('BAD_FORMAT', `Unrecognized format identifier: ${String(meta.format)}.`);
  }
  if (!nonEmptyString(meta.formatVersion) || !SUPPORTED_EXPORT_VERSIONS.includes(meta.formatVersion)) {
    err('UNSUPPORTED_VERSION', `Unsupported export version: ${String(meta.formatVersion)}.`);
  }

  const kind = meta.kind as ExportKind;
  if (kind !== 'FULL_BACKUP' && kind !== 'HISTORY' && kind !== 'ANALYSIS') {
    return {
      ok: false,
      errors: [...errors, { code: 'BAD_KIND', message: `Unknown export kind: ${String(meta.kind)}.` }],
      warnings,
      kind: null,
      counts: null,
    };
  }

  // Required collections present and array-typed.
  const collections = ['shoes', 'rounds', 'revisions', 'lockedPredictions', 'sessionStates'];
  for (const name of collections) {
    if (data[name] !== undefined && !Array.isArray(data[name])) {
      err('BAD_COLLECTION', `data.${name} must be an array.`);
    }
  }
  for (const name of REQUIRED_COLLECTIONS[kind]) {
    if (!Array.isArray(data[name])) {
      err('MISSING_COLLECTION', `Required collection data.${name} is missing for ${kind}.`);
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors, warnings, kind, counts: null };
  }

  const shoes = (data.shoes as unknown[]) ?? [];
  const rounds = (data.rounds as unknown[]) ?? [];
  const revisions = (data.revisions as unknown[]) ?? [];
  const lockedPredictions = (data.lockedPredictions as unknown[]) ?? [];
  const sessionStates = (data.sessionStates as unknown[]) ?? [];

  // --- shoes ---------------------------------------------------------------
  const shoeIds = new Set<string>();
  shoes.forEach((s, i) => {
    if (!isObject(s) || !nonEmptyString(s.id)) return err('BAD_SHOE', `shoes[${i}] has no valid id.`);
    if (shoeIds.has(s.id)) err('DUP_SHOE', `Duplicate shoe id: ${s.id}.`);
    shoeIds.add(s.id);
    if (!shoeStatusSet.has(String(s.status))) err('BAD_ENUM', `shoes[${i}] invalid status ${String(s.status)}.`);
    if (!environmentSet.has(String(s.environment))) err('BAD_ENUM', `shoes[${i}] invalid environment.`);
  });

  // --- rounds --------------------------------------------------------------
  const roundIds = new Set<string>();
  const roundsByShoe = new Map<string, number[]>();
  rounds.forEach((r, i) => {
    if (!isObject(r) || !nonEmptyString(r.id)) return err('BAD_ROUND', `rounds[${i}] has no valid id.`);
    if (roundIds.has(r.id)) err('DUP_ROUND_ID', `Duplicate round id: ${r.id}.`);
    roundIds.add(r.id);
    if (!nonEmptyString(r.shoeId) || !shoeIds.has(r.shoeId)) {
      err('ORPHAN_ROUND', `rounds[${i}] references unknown shoe ${String(r.shoeId)}.`);
    }
    if (!isInt(r.roundNumber) || (r.roundNumber as number) < 1) {
      err('BAD_ROUND_NUMBER', `rounds[${i}] invalid roundNumber ${String(r.roundNumber)}.`);
    }
    if (!winnerSet.has(String(r.winner))) err('BAD_ENUM', `rounds[${i}] invalid winner ${String(r.winner)}.`);
    if (!pairSet.has(String(r.playerPair))) err('BAD_ENUM', `rounds[${i}] invalid playerPair.`);
    if (!pairSet.has(String(r.bankerPair))) err('BAD_ENUM', `rounds[${i}] invalid bankerPair.`);
    if (nonEmptyString(r.shoeId) && isInt(r.roundNumber)) {
      const list = roundsByShoe.get(r.shoeId) ?? [];
      list.push(r.roundNumber as number);
      roundsByShoe.set(r.shoeId, list);
    }
  });
  // per-shoe round numbering: unique + continuity warning
  for (const [shoeId, numbers] of roundsByShoe) {
    const seen = new Set<number>();
    for (const n of numbers) {
      if (seen.has(n)) err('DUP_ROUND_NUMBER', `Duplicate round number ${n} in shoe ${shoeId}.`);
      seen.add(n);
    }
    const sorted = [...numbers].sort((a, b) => a - b);
    for (let k = 0; k < sorted.length; k += 1) {
      if (sorted[k] !== k + 1) {
        warnings.push({
          code: 'ROUND_GAP',
          message: `Round numbering in shoe ${shoeId} is not contiguous from 1.`,
        });
        break;
      }
    }
  }

  // --- revisions -----------------------------------------------------------
  revisions.forEach((rv, i) => {
    if (!isObject(rv) || !nonEmptyString(rv.id)) return err('BAD_REVISION', `revisions[${i}] has no valid id.`);
    if (!nonEmptyString(rv.shoeId) || !shoeIds.has(rv.shoeId)) {
      err('ORPHAN_REVISION', `revisions[${i}] references unknown shoe ${String(rv.shoeId)}.`);
    }
    if (!actionSet.has(String(rv.action))) err('BAD_ENUM', `revisions[${i}] invalid action ${String(rv.action)}.`);
  });

  // --- locked predictions --------------------------------------------------
  const lpeIds = new Set<string>();
  const validByTarget = new Map<string, number>();
  lockedPredictions.forEach((p, i) => {
    if (!isObject(p) || !nonEmptyString(p.id)) return err('BAD_LPE', `lockedPredictions[${i}] has no valid id.`);
    if (lpeIds.has(p.id)) err('DUP_LPE_ID', `Duplicate locked prediction id: ${p.id}.`);
    lpeIds.add(p.id);
    if (!nonEmptyString(p.shoeId) || !shoeIds.has(p.shoeId)) {
      err('ORPHAN_LPE', `lockedPredictions[${i}] references unknown shoe ${String(p.shoeId)}.`);
    }
    if (!isInt(p.targetRoundNumber)) err('BAD_LPE', `lockedPredictions[${i}] invalid targetRoundNumber.`);
    if (!decisionSet.has(String(p.decision))) err('BAD_ENUM', `lockedPredictions[${i}] invalid decision.`);
    if (!categorySet.has(String(p.category))) err('BAD_ENUM', `lockedPredictions[${i}] invalid category.`);
    if (!evaluationSet.has(String(p.evaluation))) err('BAD_ENUM', `lockedPredictions[${i}] invalid evaluation.`);
    if (!operatorSet.has(String(p.operatorAction))) err('BAD_ENUM', `lockedPredictions[${i}] invalid operatorAction.`);
    if (typeof p.invalidated !== 'boolean') err('BAD_LPE', `lockedPredictions[${i}] invalid 'invalidated' flag.`);
    if (!nonEmptyString(p.payload)) err('BAD_LPE', `lockedPredictions[${i}] missing payload.`);
    if (p.invalidated === false && nonEmptyString(p.shoeId) && isInt(p.targetRoundNumber)) {
      const key = `${p.shoeId}::${p.targetRoundNumber}`;
      const count = (validByTarget.get(key) ?? 0) + 1;
      validByTarget.set(key, count);
      if (count > 1) {
        err('DUP_VALID_LOCK', `More than one valid locked prediction for ${key}.`);
      }
    }
  });

  // --- session states ------------------------------------------------------
  sessionStates.forEach((s, i) => {
    if (!isObject(s) || !nonEmptyString(s.shoeId)) return err('BAD_SESSION', `sessionStates[${i}] has no valid shoeId.`);
    if (!shoeIds.has(s.shoeId)) err('ORPHAN_SESSION', `sessionStates[${i}] references unknown shoe ${String(s.shoeId)}.`);
    if (!environmentSet.has(String(s.environment))) err('BAD_ENUM', `sessionStates[${i}] invalid environment.`);
  });

  const counts: ExportCounts = {
    shoes: shoes.length,
    rounds: rounds.length,
    revisions: revisions.length,
    lockedPredictions: lockedPredictions.length,
    sessionStates: sessionStates.length,
  };

  return { ok: errors.length === 0, errors, warnings, kind, counts };
}
