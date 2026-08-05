import { VERSION_REGISTRY } from '../../config/versions';

/**
 * Local database contract (Milestone 0: contract only, no engine wired).
 *
 * The app is local-first and fully offline (no backend, no cloud, no network).
 * Persistence uses the on-device key/value store exposed via
 * `@/src/utils/storage`. Raw RoundRecords are the source of truth; everything
 * else is reconstructed.
 */
export const DATABASE_SCHEMA_VERSION = VERSION_REGISTRY.databaseSchema;

/** Logical storage collections owned by the app. */
export const STORAGE_KEYS = Object.freeze({
  shoes: 'bapp.shoes',
  rounds: 'bapp.rounds',
  predictions: 'bapp.predictions',
  configBatches: 'bapp.config-batches',
  schemaVersion: 'bapp.schema-version',
} as const);
