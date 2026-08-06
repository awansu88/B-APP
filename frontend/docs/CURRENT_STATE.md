# Current State

**Completed milestone:** 3 — Snapshots, Features, and Analysis Modules. **Status: COMPLETE.**
**Milestone 4: NOT STARTED** — Decision Pipeline only (voting → confidence → risk →
Active/Shadow decision → Prediction **Draft** + trace; NO persistence, NO locking).
**Prediction locking is Milestone 5.**
**Database schema version:** DB-001 (unchanged)
**App:** 0.1.0 · **Engine:** ENGINE-001 · **Config:** CFG-001 · **Roadmap:** ROADMAP-001
· **Snapshot:** SNAPSHOT-001 · **Feature:** FEATURE-001

## Repository facts
- **Git repository root: `/app`.** Expo app root: **`/app/frontend`** (run all
  commands from there). No backend directory is tracked; the app makes no
  network calls, has no cloud/auth.
- Package manager: **npm** with committed `package-lock.json` (single lock file,
  **unchanged** this milestone — no dependencies added or upgraded).

## What exists (accepted)
### Milestone 0 & 1 (unchanged)
- Landscape dark tablet shell + six navigable routes; version registry and
  locked engine thresholds.
- Domain models/enums; DB-001 SQLite layer over a UI-independent `SqlDatabase`;
  the pure `buildRoadmap` engine. All still intact and untouched.

### Milestone 2 (new — Active Shoe History Input Mode)
- **Pure History domain** (`src/domain/history/`, no React/RN/Expo/SQLite):
  `pair-mode` (COMPLETE⇒NO / PARTIAL⇒UNKNOWN, draft + auto-reset), `statistics`
  (total / non-Tie / P / T / B counts), `checkpoints` (rounds 15/20/30 then every
  +10; `MIN_NON_TIE_RESULTS = 8` warm-up gate), `transaction-guard` (double-tap /
  busy re-entrancy guard), and `session` (pure `appendRound` / `undoLast` /
  `editRound` / `deleteRound` returning new ordered rounds + audit revision;
  delete renumbers 1..n).
- **Data (additive, DB-001 untouched):** `RoundRepository.update()` (edit-in-place
  + UPDATE revision, atomic) and `RoundRepository.replaceShoe()` (full renumbered
  replacement + revision, atomic — used for delete/clear); `ShoeRepository.updateMeta()`.
- **Workflow seam** (`src/workflows/history/`): `useHistorySession` hook +
  `HistoryStore` persistence. Native uses the accepted SQLite layer
  (`SqliteHistoryStore` via `ExpoSqliteDatabase`); **web uses an AsyncStorage
  fallback** (`MemoryHistoryStore`) selected through platform-specific
  `create-store.ts` / `create-store.web.ts` so expo-sqlite's wa-sqlite wasm is
  never bundled on web. Raw rounds remain the only source of truth; the roadmap
  is rebuilt via `buildRoadmap` after every mutation.
- **Active Shoe screen** (`src/app/(shell)/index.tsx`), landscape 3-zone layout:
  - **Left** `ShoeInfoPanel`: shoe id/env, total rounds, non-Tie rounds, Player /
    Tie / Banker totals, and history-confirmation status.
  - **Center** `RoadmapBoards`: Bead Plate, Big Road (tie counts + pair dots),
    Big Eye Boy, Small Road, Cockroach Pig.
  - **Bottom** `ControlBar`: large **PLAYER / TIE / BANKER** buttons (exact P/T/B
    order), PP/BP toggles, Partial/Complete pair-mode switch, and secondary
    controls Undo · Edit Round · Delete Round · New Shoe · Clear Shoe ·
    Start Live · Start Historical Test.
  - `CheckpointBanner` (non-blocking), `ReviewDataSheet` (ordered list with per-round
    Edit/Delete + editor), and `ConfirmDialog` (Clear Shoe / New Shoe guards).
- **Input rules honoured:** pairs reset after each save; duplicate round numbers
  are impossible (roundNumber is always length+1 and every commit is a full
  atomic replace); the `TransactionGuard` blocks double-taps and input during a
  write; Clear Shoe / New Shoe require confirmation. Start Live / Start Historical
  Test are enabled once ≥ 8 non-Tie results exist and set the shoe environment
  (mapping new-round source to LIVE / HISTORICAL_TEST). **No prediction logic.**

## What is explicitly NOT implemented (out of scope for Milestone 3)
- No **final voting**, confidence scoring, risk decisions, or **prediction locking**
  (`categorizeConfidence` / `evaluateStep` / `evaluateThreeWinSequence` still throw;
  no prediction/snapshot/module-result/sequence records are written).
- Historical Matcher is a **disabled interface** (never computed).
- Volatility & Derived Road analyzers are **SHADOW_ONLY** (computed, never influence a decision).
- Statistics/Export/Diagnostics/Settings routes remain Milestone 0 placeholders; the
  History Input UI (Milestone 2) is unchanged.

### Milestone 3 (new — pure domain engine)
- **Immutable ShoeStateSnapshot** (`src/domain/snapshot/shoe-snapshot.ts`,
  `SNAPSHOT-001`): completed/non-Tie/P/B/T counts, recent non-Tie history, current
  streak, previous run, Big Road state, derived-road state, revision count, data
  quality, snapshot version. Deep-frozen. **No future leakage** —
  `snapshotForTargetRound(rounds, N)` uses only rounds before N (tested).
- **Deterministic feature extraction** (`src/domain/features/feature-extraction.ts`,
  `FEATURE-001`): windows last5/last8/last12/full and feature groups distribution,
  streak, chop, Big Road, derived roads, regime & transition, volatility, data quality.
- **Shared analysis interface + modules** (`src/domain/analysis/*`): every module
  returns `{ moduleId, signal (PLAYER|BANKER|NEUTRAL|ABSTAIN), strength, reliability,
  status, reasonCodes, riskFlags, version }`. 8 analyzers + a disabled Historical
  Matcher + a runner. **Activation:** Data Quality Guard ACTIVE; Volatility & Derived
  Road SHADOW_ONLY; Historical Matcher DISABLED (not computed); all non-guard modules
  ABSTAIN below the 8 non-Tie warm-up. No randomness/ML/network/balance/prior-financial/
  target-sequence inputs.

### Milestone 3 correction (reliability semantics, `RELPRIOR-001`)
- **`reliability` is now a deterministic, versioned UNCALIBRATED MVP PRIOR** per
  analyzer (`RELIABILITY_PRIORS` in `src/domain/analysis/types.ts`), never observed
  accuracy. It no longer depends on any current-shoe condition. The old
  `sampleFactor(min(nonTie/20,1)) × (0.5 + 0.5·stabilityScore)` coupling (and the
  regime `×0.5`, Volatility `reliability = stabilityScore`, Derived-Road
  `×0.5`, Data-Quality `reliability = quality`) was removed.
- Current-shoe evidence stays in the correct layer: pattern evidence → `strength`
  (feature formulas UNCHANGED); insufficient data → ABSTAIN; regime suitability →
  Milestone-4 `context`; volatility/stability → Milestone-4 `risk`; data quality →
  the Data Quality Guard (its `strength` still reports data quality).
- Priors (conservative, not tuned): streak 0.50 · chop 0.50 · run-length 0.45 ·
  distribution 0.40 · regime-transition 0.45 · data-quality-guard 0.50 ·
  volatility 0.30 · derived-road 0.30 · historical-matcher 0.00. See
  `docs/ENGINE_RULES.md`. Data Quality Guard stays ACTIVE/non-directional;
  Volatility & Derived Road stay SHADOW_ONLY; Historical Matcher stays DISABLED.

## Verification (this milestone)
- `npm run typecheck` → pass · `npm run lint` → pass
- `npm test` → **7 suites, 120 tests** (adds `reliability.test.ts` ×13 for the
  reliability-semantics correction: prior is decoupled from non-Tie count /
  stability / volatility, strength still responds to features, ABSTAIN below
  warm-up, `[0,1]` bounds, determinism, Historical Matcher DISABLED, shadow
  modules SHADOW_ONLY, Data Quality Guard non-directional). Per-file: smoke 6 ·
  engine 10 · roadmap 26 · database 15 · history 22 · analysis 28 · reliability 13.
- `test:roadmap` → 26 · `test:engine` → 10 · `expo-doctor` → 18/18
- `package-lock.json` unchanged; roadmap engine, DB-001, engine thresholds, and the
  version registry all UNCHANGED (only `src/domain/analysis/modules.ts`,
  `src/domain/analysis/types.ts`, and the new `src/tests/reliability.test.ts`
  changed for the reliability correction).

## Native persistence status
- **IMPLEMENTED_NOT_RUNTIME_VERIFIED** (Milestone 2; unchanged this milestone).
