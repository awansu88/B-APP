/**
 * DB-001 schema. Raw rounds are the only source of truth; roadmap cells are
 * NEVER stored as editable source data (they are always reconstructed by the
 * pure roadmap engine). All statements are plain DDL (no bound parameters).
 */
export const DB_001_STATEMENTS: readonly string[] = Object.freeze([
  `CREATE TABLE shoes (
     id TEXT PRIMARY KEY NOT NULL,
     label TEXT,
     environment TEXT NOT NULL,
     status TEXT NOT NULL,
     round_count INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );`,
  `CREATE TABLE rounds (
     id TEXT PRIMARY KEY NOT NULL,
     shoe_id TEXT NOT NULL,
     round_number INTEGER NOT NULL,
     winner TEXT NOT NULL,
     player_pair TEXT NOT NULL,
     banker_pair TEXT NOT NULL,
     source TEXT NOT NULL,
     created_at TEXT NOT NULL,
     UNIQUE (shoe_id, round_number),
     FOREIGN KEY (shoe_id) REFERENCES shoes (id) ON DELETE CASCADE
   );`,
  `CREATE INDEX idx_rounds_shoe_id ON rounds (shoe_id);`,
  `CREATE TABLE snapshots (
     id TEXT PRIMARY KEY NOT NULL,
     shoe_id TEXT NOT NULL,
     round_number INTEGER NOT NULL,
     roadmap_version TEXT NOT NULL,
     payload TEXT NOT NULL,
     created_at TEXT NOT NULL,
     FOREIGN KEY (shoe_id) REFERENCES shoes (id) ON DELETE CASCADE
   );`,
  `CREATE INDEX idx_snapshots_shoe_id ON snapshots (shoe_id);`,
  `CREATE TABLE predictions (
     id TEXT PRIMARY KEY NOT NULL,
     shoe_id TEXT NOT NULL,
     target_round_number INTEGER NOT NULL,
     environment TEXT NOT NULL,
     decision TEXT NOT NULL,
     category TEXT NOT NULL,
     confidence REAL NOT NULL,
     status TEXT NOT NULL,
     evaluation TEXT NOT NULL,
     engine_version TEXT NOT NULL,
     config_version TEXT NOT NULL,
     locked_at TEXT NOT NULL,
     evaluated_at TEXT,
     FOREIGN KEY (shoe_id) REFERENCES shoes (id) ON DELETE CASCADE
   );`,
  `CREATE INDEX idx_predictions_target_round ON predictions (target_round_number);`,
  `CREATE INDEX idx_predictions_shoe_id ON predictions (shoe_id);`,
  `CREATE INDEX idx_predictions_environment ON predictions (environment);`,
  `CREATE INDEX idx_predictions_category ON predictions (category);`,
  `CREATE TABLE module_results (
     id TEXT PRIMARY KEY NOT NULL,
     prediction_id TEXT NOT NULL,
     module_id TEXT NOT NULL,
     signal TEXT NOT NULL,
     status TEXT NOT NULL,
     weight REAL NOT NULL,
     detail TEXT,
     created_at TEXT NOT NULL,
     FOREIGN KEY (prediction_id) REFERENCES predictions (id) ON DELETE CASCADE
   );`,
  `CREATE INDEX idx_module_results_prediction_id ON module_results (prediction_id);`,
  `CREATE TABLE sequences (
     id TEXT PRIMARY KEY NOT NULL,
     shoe_id TEXT NOT NULL,
     start_round_number INTEGER,
     consecutive_wins INTEGER NOT NULL DEFAULT 0,
     achieved INTEGER NOT NULL DEFAULT 0,
     failed INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     FOREIGN KEY (shoe_id) REFERENCES shoes (id) ON DELETE CASCADE
   );`,
  `CREATE INDEX idx_sequences_shoe_id ON sequences (shoe_id);`,
  `CREATE TABLE revisions (
     id TEXT PRIMARY KEY NOT NULL,
     shoe_id TEXT NOT NULL,
     round_number INTEGER,
     action TEXT NOT NULL,
     before TEXT,
     after TEXT,
     created_at TEXT NOT NULL,
     FOREIGN KEY (shoe_id) REFERENCES shoes (id) ON DELETE CASCADE
   );`,
  `CREATE INDEX idx_revisions_shoe_id ON revisions (shoe_id);`,
  `CREATE TABLE engine_configs (
     id TEXT PRIMARY KEY NOT NULL,
     config_version TEXT NOT NULL,
     engine_version TEXT NOT NULL,
     roadmap_version TEXT NOT NULL,
     feature_version TEXT NOT NULL,
     voting_version TEXT NOT NULL,
     confidence_version TEXT NOT NULL,
     risk_version TEXT NOT NULL,
     thresholds TEXT NOT NULL,
     immutable INTEGER NOT NULL DEFAULT 1,
     created_at TEXT NOT NULL
   );`,
  `CREATE TABLE export_history (
     id TEXT PRIMARY KEY NOT NULL,
     entity TEXT NOT NULL,
     format TEXT NOT NULL,
     detail TEXT,
     created_at TEXT NOT NULL
   );`,
  `CREATE TABLE diagnostic_events (
     id TEXT PRIMARY KEY NOT NULL,
     level TEXT NOT NULL,
     message TEXT NOT NULL,
     context TEXT,
     created_at TEXT NOT NULL
   );`,
] as const);
