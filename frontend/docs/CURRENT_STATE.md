# Current State

**Completed milestone:** 1 — Local Data and Roadmap Engine. **Status: COMPLETE.**
**Milestone 2: NOT STARTED.**
**Database schema version:** DB-001
**App:** 0.1.0 · **Engine:** ENGINE-001 · **Config:** CFG-001 · **Roadmap:** ROADMAP-001

## Repository facts
- **Git repository root: `/app`.** Expo app root: **`/app/frontend`** (run all
  commands from there). No backend directory is tracked; the app makes no
  network calls, has no cloud/auth.
- Package manager: **npm** with committed `package-lock.json` (single lock file).

## What exists (accepted)
### Milestone 0 (unchanged)
- Landscape, dark, tablet shell + six navigable placeholder routes.
- Version registry and locked engine thresholds.

### Milestone 1 (new — Parts A/B/C)
- **Domain models & enums (Part A)** — strongly typed, no untyped string values:
  `Winner`, `PairState`, `RoundSource`, `SessionEnvironment`, `ShoeStatus`,
  `PredictionDecision`, `PredictionCategory`, `PredictionStatus`,
  `EvaluationStatus`, `ModuleSignal`, `ModuleStatus`; records `ShoeRecord`,
  `RoundRecord`, `SnapshotRecord`, `PredictionRecord`, `ModuleResult`,
  `SequenceRecord`, `RevisionRecord`, `EngineConfig`. (`Outcome`/`PairStatus`/
  `ConfidenceCategory`/`AnalyzerMode` remain as aliases of the new enums.)
- **SQLite database (Part B)** — `expo-sqlite`, migration **DB-001** creating
  `shoes, rounds, snapshots, predictions, module_results, sequences, revisions,
  engine_configs, export_history, diagnostic_events` (+ `schema_migrations`).
  Unique `(shoe_id, round_number)`; indexes on rounds.shoe_id and predictions
  target_round_number / shoe_id / environment / category. Parameterized
  statements, transactions for multi-table ops, WAL enabled when supported.
  Repositories (`ShoeRepository`, `RoundRepository`, `RevisionRepository`)
  depend only on a UI-independent `SqlDatabase` abstraction. Raw rounds are the
  only source of truth; roadmap cells are never stored as editable data.
- **Pure roadmap engine (Part C)** — `src/domain/roadmap/engine.ts`
  (`buildRoadmap`). NO React/RN/Expo/SQLite/UI imports. Produces Bead Plate,
  Big Road logical cells (6 rows + dragon tail), Big Eye Boy, Small Road,
  Cockroach Pig, tie markers, player/banker pair markers, and the leading-tie
  count. Colours are a UI model (P=blue, B=red, T=green); derived marks use a
  structural `DerivedMark` enum (never stored as PLAYER/BANKER). Deterministic:
  editing rounds and rebuilding reproduces identical output.

## What is explicitly NOT implemented (out of scope for Milestone 1)
- No screens beyond the Milestone 0 placeholders; no prediction modules,
  voting, confidence, risk, or session logic. `categorizeConfidence`,
  `evaluateStep`, `evaluateThreeWinSequence` remain explicit placeholders that
  throw. Historical Matcher DISABLED; Volatility & Derived Road SHADOW_ONLY.
- The `expo-sqlite` adapter is complete but intentionally not yet wired into any
  screen (dormant infrastructure — no broken partial UI integration).

## Verification (this milestone)
- `npm run typecheck` → pass (0 errors)
- `npm run lint` → pass (0 problems)
- `npm test` → 4 suites, 52 tests passing
- `npm run test:roadmap` → 1 suite, 26 tests passing (16 core + 9 derived-road
  golden fixtures + 1 source-of-truth rebuild)
- `npm run test:engine` → 1 suite, 10 tests passing
- `npx expo-doctor` → 18/18 checks passed
- App boots in the preview; navigation across all six routes verified.
