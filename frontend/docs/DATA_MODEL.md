# Data Model (LOCKED)

## Version registry (`src/config/versions.ts`)
| Key             | Value        |
|-----------------|--------------|
| app             | `0.1.0`      |
| engine          | `ENGINE-001` |
| config          | `CFG-001`    |
| databaseSchema  | `DB-001`     |
| roadmap         | `ROADMAP-001`|
| feature         | `FEATURE-001`|
| voting          | `VOTE-001`   |
| confidence      | `CONF-001`   |
| risk            | `RISK-001`   |

## Enumerations (`src/domain/models/`)
- `Winner` = `PLAYER | TIE | BANKER` — UI order `P / T / B`. (Alias: `Outcome`.)
- `PairState` = `YES | NO | UNKNOWN`. (Alias: `PairStatus`.)
- `RoundSource` = `HISTORY | LIVE | HISTORICAL_TEST`.
- `SessionEnvironment` = `HISTORY_INPUT | LIVE_FORWARD | HISTORICAL_TEST`.
- `ShoeStatus` = `ACTIVE | COMPLETED | ARCHIVED`.
- `PredictionDecision` = `BET_PLAYER | BET_BANKER | SKIP`.
- `PredictionCategory` = `BELOW_THRESHOLD | EXPERIMENTAL | QUALIFIED | HIGH_RECOMMENDATION`.
  (Alias: `ConfidenceCategory`.)
- `PredictionStatus` = `LOCKED | EVALUATED | VOID`.
- `EvaluationStatus` = `PENDING | WIN | LOSS | PUSH | SKIP`.
- `ModuleSignal` = `PLAYER | BANKER | NONE`.
- `ModuleStatus` = `ACTIVE | SHADOW_ONLY | EXPERIMENTAL_ONLY | DISABLED`.
  (Alias: `AnalyzerMode`.)

## Typed records (`src/domain/models/records.ts`, `round.ts`)
`ShoeRecord`, `RoundRecord` (raw source of truth: `shoeId + roundNumber` unique,
`winner`, `playerPair`, `bankerPair`, `source`), `SnapshotRecord`,
`PredictionRecord` (locked before result; carries engine/config versions),
`ModuleResult`, `SequenceRecord`, `RevisionRecord` (audit of edits),
`EngineConfig`.

## Persistence — SQLite (DB-001)
- Driver-agnostic `SqlDatabase` abstraction (`src/data/database/sql-database.ts`);
  app adapter `ExpoSqliteDatabase` (`expo-sqlite`, WAL when supported,
  `foreign_keys = ON`). Tests use an in-memory `sql.js` driver.
- Migration **DB-001** (`schema.ts` + `migrations.ts`) creates tables:
  `shoes`, `rounds`, `snapshots`, `predictions`, `module_results`, `sequences`,
  `revisions`, `engine_configs`, `export_history`, `diagnostic_events`
  (+ `schema_migrations` ledger).
- Constraints/indexes: `rounds UNIQUE(shoe_id, round_number)`,
  `idx_rounds_shoe_id`, and predictions indexes on `target_round_number`,
  `shoe_id`, `environment`, `category` (plus snapshots/module_results/sequences/
  revisions shoe/prediction indexes). All writes use parameterized statements;
  multi-table operations use transactions.
- Raw rounds are the ONLY source of truth. Roadmap cells are **never** stored as
  editable source data — they are always reconstructed by the pure roadmap
  engine.

## Migrations
Accepted migrations are **immutable** (`MIGRATIONS` in `migrations.ts`). Never
edit DB-001 — append DB-002, etc. `runMigrations` is idempotent.
