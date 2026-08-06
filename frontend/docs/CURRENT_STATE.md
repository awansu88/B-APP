# Current State

**Completed milestone:** 2 — History Input Workflow and Roadmap UI. **Status: COMPLETE.**
**Milestone 3: NOT STARTED.**
**Database schema version:** DB-001 (unchanged — no new migration needed)
**App:** 0.1.0 · **Engine:** ENGINE-001 · **Config:** CFG-001 · **Roadmap:** ROADMAP-001

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

## What is explicitly NOT implemented (out of scope for Milestone 2)
- No analyzers, voting, confidence, risk, prediction, or three-win sequence logic
  (`categorizeConfidence` / `evaluateStep` / `evaluateThreeWinSequence` still throw).
- Statistics/Export/Diagnostics/Settings routes remain Milestone 0 placeholders.
- No final visual polish; category/prediction areas are intentionally absent.

## Verification (this milestone)
- `npm run typecheck` → pass (0 errors)
- `npm run lint` → pass (0 problems)
- `npm test` → 5 suites, **79 tests** passing. New this milestone: `history.test.ts`
  (22) and **5** DB persistence tests added to `database.test.ts` (update,
  replaceShoe-replace, replaceShoe-clear, New-Shoe preservation, id-stability).
  Per-file: smoke 6 · engine 10 · roadmap 26 · database 15 (was 10) · history 22.
- `npm run test:roadmap` → 26 tests passing (unchanged)
- `npm run test:engine` → 10 tests passing (unchanged)
- `npx expo-doctor` → 18/18 checks passed
- `package-lock.json` unchanged; no dependencies added/upgraded.
- App boots in the web preview (bundle HTTP 200, no console errors/warnings).
  Full interaction-level validation (42 cases A–H) passed via the frontend
  testing agent: round entry, input safety/double-tap, pair modes, edit/delete +
  roadmap rebuild, warm-up gate, checkpoints (15/20/30/40/50), shoe controls, and
  persistence across page reload.

## Native persistence status
- **IMPLEMENTED_NOT_RUNTIME_VERIFIED.** The native path (`SqliteHistoryStore` →
  `ExpoSqliteDatabase`, DB-001) is implemented and its logic is covered by the
  in-memory `sql.js` driver tests, but it has NOT been executed on a physical
  Android device/build with an app restart. Remaining Android verification: open
  the app, enter rounds, kill & relaunch, confirm the same shoe + rounds restore
  from on-device SQLite.
