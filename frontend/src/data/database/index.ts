import { VERSION_REGISTRY } from '../../config/versions';

// NOTE: the expo-sqlite adapter is intentionally NOT re-exported here so that
// importing the database barrel never pulls in the native module (keeps the
// pure engine and the test suite free of native dependencies). Import
// `./expo-sqlite-database` directly from app wiring.
export * from './sql-database';
export * from './schema';
export * from './migrations';

/** The database schema version (DB-001). */
export const DATABASE_SCHEMA_VERSION = VERSION_REGISTRY.databaseSchema;
