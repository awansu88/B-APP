# Test Plan

## Tooling
- **Jest** with **ts-jest** (node environment) — pure TypeScript.
- Database tests run against an in-memory **sql.js** driver
  (`src/tests/support/sqljs-database.ts`) implementing the same `SqlDatabase`
  abstraction as the app's `expo-sqlite` adapter.

## Scripts
| Script                  | Purpose                                   |
|-------------------------|-------------------------------------------|
| `npm run typecheck`     | `tsc --noEmit` (strict TypeScript)        |
| `npm run lint`          | `expo lint`                               |
| `npm test`              | Run all Jest suites                       |
| `npm run test:roadmap`  | Roadmap golden suite (`jest roadmap`)     |
| `npm run test:engine`   | Engine constants/enums suite (`jest engine`) |
| `npx expo-doctor`       | Project health checks                     |

## Suites
### `src/tests/smoke.test.ts` (6 tests)
Locked version registry (incl. `databaseSchema = DB-001`), thresholds, UI order
P/T/B, session environments, prediction decisions, diagnostics snapshot.

### `src/tests/engine.test.ts` (10 tests)
Locked engine version/thresholds; enum values (decisions / categories /
step evaluations); analyzer registry modes; confidence/sequence functions are
explicit unimplemented placeholders (throw).

### `src/tests/roadmap.test.ts` (16 golden tests)
Fixed expected-coordinate tests: Player streak, Banker streak, perfect chop,
mixed singles/doubles, >6 identical, dragon tail, leading Tie, multiple Tie
after a result, Tie between same-side results, Player Pair, Banker Pair, double
pair, pair on a Tie, delete-final-and-rebuild, correct-middle-and-rebuild, and
repeated-rebuild determinism.

### `src/tests/database.test.ts` (8 tests)
DB-001 migration creation (all tables + ledger), migration idempotency, shoe
insert/retrieval, sequential rounds, duplicate-round rejection (unique
constraint), transaction rollback, persistence abstraction, and INSERT revision
creation.

## Expected result (Milestone 1)
- typecheck: **pass**
- lint: **pass**
- `npm test`: **4 suites, 40 tests passing**
- `test:roadmap`: **1 suite, 16 tests**
- `test:engine`: **1 suite, 10 tests**
- expo-doctor: **18/18 checks pass**
