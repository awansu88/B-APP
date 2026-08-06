/**
 * Database migrations moved to `src/data/database/migrations.ts` in Milestone 1
 * (schema version DB-001). This module re-exports them so existing import paths
 * keep working. Accepted migrations are immutable — append new ones.
 */
export { MIGRATIONS, CURRENT_DB_VERSION, runMigrations } from '../database/migrations';
export type { DbMigration } from '../database/migrations';
