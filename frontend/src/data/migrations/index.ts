/**
 * Database migrations.
 *
 * Accepted migrations are IMMUTABLE — never modify an accepted migration
 * (see AGENTS.md). New schema changes append a new migration entry.
 */
export interface Migration {
  readonly version: number;
  readonly name: string;
  /** Accepted migrations are locked and must never be edited. */
  readonly accepted: boolean;
}

export const MIGRATIONS: readonly Migration[] = Object.freeze([
  { version: 0, name: 'initial_baseline', accepted: true },
] as const);

/** The current (accepted) schema version. */
export const CURRENT_SCHEMA_VERSION = 0;
