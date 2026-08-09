/**
 * M7.2 Patch 2 — FILE TRANSPORT for the accepted BAPP-EXPORT / EXPORT-001 domain.
 *
 * This is a THIN, PURE layer over the existing M6 backup domain
 * (build/serialize/validate/merge). It adds ONLY:
 *   - portable file naming (`.bappbackup`) + a raw-SQLite snapshot name,
 *   - safe parse + inspect of an imported file body into a validation summary.
 *
 * It invents NO second format. The logical payload remains BAPP-EXPORT /
 * EXPORT-001 exactly as produced by `buildExport` / `serializeExport`.
 */
import type { BappDataset } from './dataset';
import type { BappExport, ExportKind } from './format';
import { EXPORT_FORMAT_VERSION } from './format';
import { planMerge, type MergePlan } from './merge';
import { validateExport, type ValidationResult } from './validate';

/** Portable file conventions (documented). Body is EXPORT-001 JSON. */
export const BAPP_BACKUP_EXTENSION = '.bappbackup';
export const BAPP_BACKUP_MIME = 'application/json';
export const BAPP_RAW_SQLITE_EXTENSION = '.db';
export const BAPP_RAW_SQLITE_MIME = 'application/octet-stream';

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Deterministic `YYYY-MM-DD-HHmm` local-time stamp for filenames. */
export function fileStamp(d: Date): string {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `-${pad2(d.getHours())}${pad2(d.getMinutes())}`
  );
}

const KIND_LABEL: Record<ExportKind, string> = {
  FULL_BACKUP: 'Full-Backup',
  HISTORY: 'History',
  ANALYSIS: 'Analysis',
};

/** e.g. `BAPP-Full-Backup-2026-01-01-0930.bappbackup`. */
export function exportFileName(kind: ExportKind, now: Date = new Date()): string {
  return `BAPP-${KIND_LABEL[kind]}-${fileStamp(now)}${BAPP_BACKUP_EXTENSION}`;
}

/** e.g. `BAPP-Raw-Snapshot-2026-01-01-0930.db` (ADVANCED diagnostic only). */
export function rawSqliteFileName(now: Date = new Date()): string {
  return `BAPP-Raw-Snapshot-${fileStamp(now)}${BAPP_RAW_SQLITE_EXTENSION}`;
}

/** Human-readable import summary (Section 14). */
export interface ImportSummary {
  readonly fileName: string | null;
  readonly type: ExportKind | null;
  readonly exportVersion: string | null;
  readonly shoes: number;
  readonly rounds: number;
  readonly lockedPredictions: number;
  readonly conflicts: number;
  readonly duplicates: number;
  readonly newRecords: number;
}

export interface ImportInspection {
  readonly ok: boolean;
  readonly validation: ValidationResult;
  /** The parsed+validated export, or null when malformed/invalid. */
  readonly parsed: BappExport | null;
  /** Merge preview vs the current dataset (null when no dataset or invalid). */
  readonly plan: MergePlan | null;
  readonly summary: ImportSummary;
}

const emptySummary = (fileName: string | null): ImportSummary => ({
  fileName,
  type: null,
  exportVersion: null,
  shoes: 0,
  rounds: 0,
  lockedPredictions: 0,
  conflicts: 0,
  duplicates: 0,
  newRecords: 0,
});

const readVersion = (parsed: unknown): string | null => {
  if (parsed && typeof parsed === 'object') {
    const meta = (parsed as { meta?: { formatVersion?: unknown } }).meta;
    if (meta && typeof meta.formatVersion === 'string') return meta.formatVersion;
  }
  return null;
};

/**
 * Parse + validate an imported file body and (when a current dataset is
 * supplied) compute the ZERO-WRITE merge preview. Never writes. Malformed JSON
 * yields a user-readable MALFORMED error rather than a thrown stack trace.
 */
export function inspectImport(
  fileName: string | null,
  text: string,
  existing: BappDataset | null,
): ImportInspection {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      validation: {
        ok: false,
        errors: [{ code: 'MALFORMED', message: 'File is not valid JSON.' }],
        warnings: [],
        kind: null,
        counts: null,
      },
      parsed: null,
      plan: null,
      summary: emptySummary(fileName),
    };
  }

  const validation = validateExport(parsed);
  if (!validation.ok) {
    return {
      ok: false,
      validation,
      parsed: null,
      plan: null,
      summary: {
        ...emptySummary(fileName),
        type: validation.kind,
        exportVersion: readVersion(parsed),
        shoes: validation.counts?.shoes ?? 0,
        rounds: validation.counts?.rounds ?? 0,
        lockedPredictions: validation.counts?.lockedPredictions ?? 0,
      },
    };
  }

  const exp = parsed as BappExport;
  const plan = existing ? planMerge(existing, exp) : null;
  const newRecords = plan
    ? plan.report.shoesAdded +
      plan.report.roundsAdded +
      plan.report.revisionsAdded +
      plan.report.predictionsAdded +
      plan.report.sessionStatesAdded
    : 0;

  return {
    ok: true,
    validation,
    parsed: exp,
    plan,
    summary: {
      fileName,
      type: exp.meta.kind,
      exportVersion: exp.meta.formatVersion,
      shoes: exp.meta.counts.shoes,
      rounds: exp.meta.counts.rounds,
      lockedPredictions: exp.meta.counts.lockedPredictions,
      conflicts: plan ? plan.report.conflicts.length : 0,
      duplicates: plan ? plan.report.duplicatesSkipped : 0,
      newRecords,
    },
  };
}

/** True only for the EXPORT-001 format version (documented compatibility). */
export const isCurrentExportVersion = (v: string | null): boolean => v === EXPORT_FORMAT_VERSION;
