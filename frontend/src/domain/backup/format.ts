/**
 * Milestone 6 — versioned, self-describing B-APP export format (PURE).
 *
 * A `.bapp.json` export carries metadata (format id, format version, schema
 * version, engine/app versions, generated timestamp, record counts) plus the
 * authoritative record payloads. Locked-prediction payloads are copied VERBATIM
 * and are never regenerated. No credentials/secrets/env/platform files are ever
 * exported — only the record collections below.
 */
import { VERSION_REGISTRY } from '../../config/versions';
import type { RoundRecord } from '../models/round';
import type { RevisionRecord, ShoeRecord } from '../models/records';
import type {
  BappDataset,
  LockedPredictionEntryRecord,
  SessionStateRecord,
} from './dataset';

export const BAPP_EXPORT_FORMAT = 'BAPP-EXPORT';
export const EXPORT_FORMAT_VERSION = 'EXPORT-001';
export const SUPPORTED_EXPORT_VERSIONS: readonly string[] = Object.freeze([
  EXPORT_FORMAT_VERSION,
]);

/** What an export was produced from (labelled for the operator). */
export type ExportSource = 'native-sqlite' | 'web-preview';

/**
 * Export variants:
 *  - FULL_BACKUP: everything required to restore local B-APP state.
 *  - HISTORY:     shoes + rounds + revisions (raw baccarat history).
 *  - ANALYSIS:    shoes + locked-prediction/evaluation audit for later analysis.
 */
export type ExportKind = 'FULL_BACKUP' | 'HISTORY' | 'ANALYSIS';

export interface ExportCounts {
  readonly shoes: number;
  readonly rounds: number;
  readonly revisions: number;
  readonly lockedPredictions: number;
  readonly sessionStates: number;
}

export interface ExportMeta {
  readonly format: typeof BAPP_EXPORT_FORMAT;
  readonly formatVersion: string;
  readonly kind: ExportKind;
  readonly generatedAt: string;
  readonly schemaVersion: string;
  readonly appVersion: string;
  readonly engineVersion: string;
  readonly configVersion: string;
  readonly roadmapVersion: string;
  readonly source: ExportSource;
  readonly counts: ExportCounts;
}

export interface ExportData {
  readonly shoes: readonly ShoeRecord[];
  readonly rounds: readonly RoundRecord[];
  readonly revisions: readonly RevisionRecord[];
  readonly lockedPredictions: readonly LockedPredictionEntryRecord[];
  readonly sessionStates: readonly SessionStateRecord[];
}

export interface BappExport {
  readonly meta: ExportMeta;
  readonly data: ExportData;
}

export interface BuildExportOptions {
  readonly kind: ExportKind;
  readonly source: ExportSource;
  readonly now?: string;
}

const countsOf = (data: ExportData): ExportCounts => ({
  shoes: data.shoes.length,
  rounds: data.rounds.length,
  revisions: data.revisions.length,
  lockedPredictions: data.lockedPredictions.length,
  sessionStates: data.sessionStates.length,
});

/** Select the record collections included for a given export kind. */
function selectData(dataset: BappDataset, kind: ExportKind): ExportData {
  switch (kind) {
    case 'FULL_BACKUP':
      return {
        shoes: dataset.shoes,
        rounds: dataset.rounds,
        revisions: dataset.revisions,
        lockedPredictions: dataset.lockedPredictions,
        sessionStates: dataset.sessionStates,
      };
    case 'HISTORY':
      return {
        shoes: dataset.shoes,
        rounds: dataset.rounds,
        revisions: dataset.revisions,
        lockedPredictions: [],
        sessionStates: [],
      };
    case 'ANALYSIS':
      return {
        shoes: dataset.shoes,
        rounds: [],
        revisions: [],
        lockedPredictions: dataset.lockedPredictions,
        sessionStates: [],
      };
  }
}

/** Build a self-describing export object from a dataset (pure; no writes). */
export function buildExport(dataset: BappDataset, opts: BuildExportOptions): BappExport {
  const data = selectData(dataset, opts.kind);
  const meta: ExportMeta = {
    format: BAPP_EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    kind: opts.kind,
    generatedAt: opts.now ?? new Date().toISOString(),
    schemaVersion: VERSION_REGISTRY.databaseSchema,
    appVersion: VERSION_REGISTRY.app,
    engineVersion: VERSION_REGISTRY.engine,
    configVersion: VERSION_REGISTRY.config,
    roadmapVersion: VERSION_REGISTRY.roadmap,
    source: opts.source,
    counts: countsOf(data),
  };
  return { meta, data };
}

/** Serialize an export to a pretty JSON string (the on-device file body). */
export function serializeExport(exp: BappExport): string {
  return JSON.stringify(exp, null, 2);
}
