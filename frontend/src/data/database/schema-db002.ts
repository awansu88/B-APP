/**
 * DB-002 — additive, forward-only migration for the Milestone-5 persistent
 * locked session (SESSION-001).
 *
 * DB-001 is an accepted historical migration and is NOT modified. DB-002 adds
 * two tables that DB-001 could not losslessly represent:
 *   - `session_state`             — per-shoe workflow/cursor metadata (resume).
 *   - `locked_prediction_entries` — the authoritative historical engine-decision
 *                                    audit (immutable locked prediction payload +
 *                                    directly-queryable lifecycle columns).
 *
 * Authority model (LOCKED):
 *   raw rounds + revisions (DB-001)         = source of truth for baccarat history
 *   locked_prediction_entries (DB-002)      = source of truth for engine-decision audit
 *   engine/played sequences + paper metrics = DERIVED (reconstructed from entries)
 *   session_state                            = workflow/cursor metadata ONLY
 *
 * The older DB-001 `predictions` / `module_results` / `sequences` scaffolding is
 * LEGACY and NON-AUTHORITATIVE for the Milestone-5 runtime (kept, never dropped).
 */
export const DB_002_STATEMENTS: readonly string[] = Object.freeze([
  `CREATE TABLE session_state (
     shoe_id TEXT PRIMARY KEY NOT NULL,
     session_version TEXT NOT NULL,
     workflow TEXT NOT NULL,
     environment TEXT NOT NULL,
     current_target_round INTEGER,
     paper_units_staked INTEGER NOT NULL DEFAULT 0,
     paper_net_units INTEGER NOT NULL DEFAULT 0,
     paper_wins INTEGER NOT NULL DEFAULT 0,
     paper_losses INTEGER NOT NULL DEFAULT 0,
     paper_pushes INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     FOREIGN KEY (shoe_id) REFERENCES shoes (id) ON DELETE CASCADE
   );`,
  `CREATE TABLE locked_prediction_entries (
     id TEXT PRIMARY KEY NOT NULL,
     shoe_id TEXT NOT NULL,
     target_round_number INTEGER NOT NULL,
     sequence_index INTEGER NOT NULL,
     status TEXT NOT NULL,
     decision TEXT NOT NULL,
     side TEXT,
     confidence REAL NOT NULL,
     category TEXT NOT NULL,
     operator_action TEXT NOT NULL,
     evaluation TEXT NOT NULL,
     actual_winner TEXT,
     invalidated INTEGER NOT NULL DEFAULT 0,
     invalidated_by_revision_id TEXT,
     invalidated_at TEXT,
     locked_at TEXT NOT NULL,
     evaluated_at TEXT,
     payload_version TEXT NOT NULL,
     payload TEXT NOT NULL,
     created_at TEXT NOT NULL,
     FOREIGN KEY (shoe_id) REFERENCES shoes (id) ON DELETE CASCADE
   );`,
  `CREATE INDEX idx_lpe_shoe_id ON locked_prediction_entries (shoe_id);`,
  `CREATE INDEX idx_lpe_target ON locked_prediction_entries (shoe_id, target_round_number);`,
  `CREATE INDEX idx_lpe_order ON locked_prediction_entries (shoe_id, sequence_index);`,
  `CREATE INDEX idx_lpe_evaluation ON locked_prediction_entries (evaluation);`,
  // Database-enforced identity: at most ONE non-invalidated (current) locked
  // prediction per shoe + target round. Invalidated historical rows may coexist.
  `CREATE UNIQUE INDEX uq_lpe_valid_target
     ON locked_prediction_entries (shoe_id, target_round_number)
     WHERE invalidated = 0;`,
] as const);
