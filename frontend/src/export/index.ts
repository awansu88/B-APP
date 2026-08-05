/**
 * Export contracts (Milestone 0: contract only).
 * All important data must be exportable (Project Principle #9). Exports are
 * produced on-device only — no cloud upload, no network.
 */
export type ExportFormat = 'JSON' | 'CSV';

export interface ExportableEntity {
  readonly id: string;
  readonly label: string;
}

/** The set of entities that must be exportable. */
export const EXPORTABLE_ENTITIES: readonly ExportableEntity[] = Object.freeze([
  { id: 'rounds', label: 'Raw Round Records' },
  { id: 'shoes', label: 'Shoes' },
  { id: 'predictions', label: 'Locked Predictions' },
  { id: 'diagnostics', label: 'Diagnostics Snapshot' },
] as const);
