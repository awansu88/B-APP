# Known Issues

## Milestone 1

### 1. Git root is `/app`; app root is `/app/frontend`; no backend tracked
The Git repository root is `/app`; the Expo application lives in `/app/frontend`
(all project commands run from there). No backend directory/file is tracked and
the app makes no network calls.

**Impact:** none. **Action:** none.

### 2. Package manager is npm; platform preview launches via yarn
The project uses **npm** with a committed `package-lock.json` (single lock file
so `expo-doctor` is clean). The preview supervisor launches via `yarn expo
start`, which only runs the local `expo` binary. If `package.json` is edited
through the platform watcher a stray `yarn.lock` can reappear — delete it to
keep a single npm lock file.

**Impact:** cosmetic. **Action:** keep npm.

### 3. `sql.js` is a TEST-ONLY dependency
`sql.js` (+ `@types/sql.js`) is a **devDependency** used only by the Jest DB
tests (`src/tests/support/sqljs-database.ts`) so repositories/migrations can run
in node without the native module. The app itself uses `expo-sqlite`. `sql.js`
is never imported by application code and is not bundled.

**Impact:** none on the app. **Action:** none.

### 4. expo-sqlite adapter is complete but not yet wired to screens (RESOLVED in M2)
The SQLite layer is now wired into the Active Shoe screen through the
`useHistorySession` workflow and `SqliteHistoryStore`. On native the accepted
DB-001 database persists rounds; see Milestone 2 note below for the web fallback.

**Impact:** none. **Action:** none.

### 5. Prediction/confidence/sequence logic is still unimplemented
`categorizeConfidence`, `evaluateStep`, and `evaluateThreeWinSequence` remain
explicit placeholders that throw. This is intentional scope control for
Milestone 1 (roadmap + data only), not a defect.

**Impact:** none. **Action:** implement in the authorised future milestone.

### 6. Derived-road golden coverage (RESOLVED)
Big Eye Boy / Small Road / Cockroach Pig now have literal, independently
hand-computed golden tests: first activation points, stable RED and BLUE runs,
structural colour transitions, derived dragon-tail, big-road dragon-tail
interaction, deterministic rebuild after a middle-round edit, and structural
enum integrity. The earlier deferral is resolved.

**Impact:** none. **Action:** none.

## Milestone 2

### 7. Web persistence uses an AsyncStorage fallback (not expo-sqlite)
`expo-sqlite`'s web backend (wa-sqlite / OPFS) is not reliably available in the
Metro web preview (the `wa-sqlite.wasm` asset fails to resolve/serve), so the web
build persists rounds through an AsyncStorage-backed `MemoryHistoryStore`. The
backend is chosen by platform-specific `create-store.ts` (native → SQLite) vs
`create-store.web.ts` (web → AsyncStorage) so the native module and its wasm are
never bundled on web. The persisted data shape is identical and raw rounds remain
the only source of truth.

**Impact:** none on native devices (real SQLite is used); web is a preview-only
convenience. **Action:** none required; revisit if web SQLite becomes reliable.

*Note (M4 audit §9):* On the AsyncStorage web shim (IndexedDB), `loadActive()`
resolves in ~0.28 s and the Active Shoe UI renders fully (verified by the frontend
testing agent: round entry, roadmap updates, and reload persistence all work, zero
console errors). A transient "Loading shoe…" that persists **only** inside the raw
headless-screenshot tool is an IndexedDB-timing artifact of that sandbox, not a
regression and not stale persisted data.

### 8. Edit/Delete persist via full renumbered replacement
To keep both persistence backends consistent and avoid touching DB-001, an
arbitrary edit uses `RoundRepository.update` and a middle-round delete / shoe
clear uses `RoundRepository.replaceShoe` (delete-all + re-insert renumbered 1..n,
inside one transaction). This is O(n) per structural mutation — negligible for a
single shoe (< ~90 rounds) and it guarantees no duplicate round numbers.

**Impact:** none. **Action:** none.

### 9. Forward modes are wired to data only (no prediction)
Start Live / Start Historical Test become available after 8 non-Tie results and
set the shoe's `environment` (mapping subsequent round `source` to LIVE /
HISTORICAL_TEST). They do **not** produce predictions — that is a later milestone.

**Impact:** none. **Action:** implement prediction flow when authorised.

### 10. Native SQLite persistence not yet runtime-verified on Android (status A)
The native persistence path (`SqliteHistoryStore` → `ExpoSqliteDatabase`, DB-001)
is implemented and its repository/migration logic is covered by the in-memory
`sql.js` driver tests, but it has **not** been executed on a physical Android
device or build with an app restart. Web preview persistence (AsyncStorage) is
verified across page reloads. Status: **A. IMPLEMENTED_NOT_RUNTIME_VERIFIED**.

**Impact:** low — logic is tested and the on-device adapter is a thin wrapper
over the same `SqlDatabase` interface used in tests. **Action (remaining Android
verification):** open the app on Android, enter rounds, kill & relaunch, and
confirm the same shoe + rounds restore from on-device SQLite. Not a Milestone-2
blocker.

### 11. Round ids are stable across edits/deletes; roundNumber is positional
Editing a round preserves its id; deleting a middle round preserves the surviving
rounds' ids and only reassigns `roundNumber` to a contiguous 1..n. Revision
`before/after` JSON captures full round snapshots, so edits are always audited.
**Forward note:** future prediction references should key off the stable round
`id` (not the positional `roundNumber`) or be invalidated when history is edited.

**Impact:** none in Milestone 2 (no predictions exist). **Action:** honour this
when prediction records are introduced.

## Milestone 3

### 12. Analysis modules produce signals but no decision is made yet
The 8 analyzers + runner compute signals/strength/reliability/reason-codes/risk-flags,
but Milestone 3 performs **no voting, confidence scoring, risk decision, or
prediction locking**. `runAnalysis` only returns per-module results (ACTIVE vs
SHADOW separated). Volatility & Derived Road are **SHADOW_ONLY** (computed, never
influential); the Historical Matcher is **DISABLED** (never computed).

**Impact:** none — this is the intended scope. **Action:** Milestone 4 implements
the **Decision Pipeline only** (Data Quality Gate, Weighted Voting, Family
Correlation Cap, Conflict Detection, Confidence Engine, Risk Filter, Active &
Shadow Decision, Prediction **Draft** + decision trace — all in-memory, no writes).
**Prediction locking, result submission/evaluation, live workflow, and sequence
tracking are Milestone 5+ and must not be built in Milestone 4.**

### 13. Regime / volatility heuristics are deterministic MVP formulas
Regime classification (alternation-rate thresholds) and the bounded 0–1
volatility/stability scores are simple, deterministic heuristics chosen for the
MVP, not calibrated statistics. They are versioned via the analyzer registry and
can be revised as a future versioned engine decision. They feed **`strength`**
and **risk flags** only — never `reliability`.

**Impact:** low (used only by SHADOW/ACTIVE signal shaping, not a final decision).
**Action:** revisit during calibration.

### 14. Analyzer `reliability` is an UNCALIBRATED MVP PRIOR (corrected `RELPRIOR-001`)
`reliability` is a deterministic, versioned prior trust value per analyzer
(`RELIABILITY_PRIORS`), **not** observed accuracy or an empirical win rate. It is
intentionally decoupled from all current-shoe conditions (non-Tie count,
stability, volatility, streak, regime, distribution, shoe position, results,
sequence state). The earlier formula
`sampleFactor(min(nonTie/20,1)) × (0.5 + 0.5·stabilityScore)` coupled reliability
to the current shoe and risked double-counting those conditions in Milestone 4;
it has been replaced with fixed conservative priors. The priors are placeholders
awaiting calibration and were not optimized against test data.

**Impact:** none functionally (Milestone 3 makes no decision); this removes a
Milestone-4 double-counting risk. **Action:** calibrate priors (and add
`context`/`risk`) in a future versioned decision.

## Milestone 4

### 15. Decision Pipeline is in-memory only (no persistence / no locking)
`src/domain/decision/*` computes a Prediction **Draft** + decision trace (ACTIVE
and SHADOW records) but writes nothing: no prediction records, no locking, no
result submission/evaluation, no live workflow, and no sequence tracking. Those
are Milestone 5+. The M0 placeholders `evaluateStep` / `evaluateThreeWinSequence`
still throw, and `categorizeConfidence` (M0) remains a placeholder — the pipeline
uses its own `categoryFromConfidence` (locked 55/60/70/75 bands).

**Impact:** none — intended scope. **Action:** Milestone 5 consumes the draft/trace.

### 16. Confidence and priors are UNCALIBRATED MVP heuristics
Weighted agreement is a consensus ratio and is explicitly **not** a win
probability. Confidence is an evidence-depth heuristic (winner score → band),
gated by agreement ≥ 58% and ≥ 2 directional modules, clamped to 0.75. The family
correlation discount (0.5), CONTEXT (regime) weight (0.5), evidence-scale
constants, and risk thresholds in `DECISION_CONFIG` (`DECISION-001`) are
conservative placeholders, not calibrated statistics.

**Impact:** low (deterministic, versioned). **Action:** calibrate in a future
versioned engine decision.

## Milestone 5

### 17. Session engine wired to the UI — RESOLVED (M5C IMPLEMENTED)
`src/domain/session/*` (SESSION-001) is now driven by the Active Shoe screen via
`src/workflows/session/use-live-session.ts` (orchestration only) + `src/ui/live/
LiveSessionPanel.tsx` (pure renderer). Start Live / Start Historical Test show the
persisted LOCKED prediction (decision / confidence-score / category / risk), the
PLAYED–NOT_PLAYED control, engine-vs-played progress, and fixed-unit paper. Actual
P/T/B is routed to the store (lock-before-result gated) and, in a forward session,
is **never** appended through the History workflow. Live-mode Review Data edit/delete
route through `SessionStore.editHistory`/`deleteHistory`; raw-round views (roadmap,
statistics, review list) are sourced from the authoritative live session.

**Impact:** none — intended scope now delivered. **Action:** final acceptance audit.

### 17a. Native session persistence is fail-safe (no silent volatile downgrade)
`createSessionStore` (native) throws `SessionPersistenceUnavailableError` if
SQLite/DB-002 cannot open/migrate — it does **not** fall back to the volatile
`MemorySessionStore` for a live persisted session. The UI then disables actual-result
submission and shows a retryable error. The web preview still uses `MemorySessionStore`
(AsyncStorage) by design; a dev diagnostic logs the active store kind.

**Impact:** none. **Action:** none.

### 17b. Invalidated historical prediction audit is persisted but not surfaced in the live panel
When live history is edited/deleted, affected locked-prediction entries are marked
INVALIDATED in DB-002 (immutable payload preserved, revision linked) and sequences/
paper rebuild from survivors. The minimal `LiveSessionPanel` renders only the current
valid lock + last result; it does not yet list the invalidated historical audit.

**Impact:** cosmetic (audit is fully persisted and queryable). **Action:** optional
UI surfacing in a later milestone.

### 17c. A rapid double-tap that fully completes yields two DISTINCT rounds (by design)
The `TransactionGuard` rejects a *concurrent* second submission while a write is in
flight (no duplicate/partial state, no duplicate valid lock per target — verified).
Two taps spaced far enough apart that the first transaction fully commits are two
legitimate distinct rounds against successive targets (N then N+1), not a duplicate.
There is intentionally no time-debounce (each result is a real round).

**Impact:** none (safety contract intact). **Action:** none.

### 19. Session/prediction persistence — RESOLVED via DB-002 (M5B)
DB-001 could not represent the M5 locked-prediction audit, so an **additive, forward-only
DB-002** migration was added (DB-001 unchanged): `session_state` (per-shoe workflow/cursor
+ paper cache) and `locked_prediction_entries` (immutable lock JSON payload +
directly-queryable lifecycle columns; partial-unique index `WHERE invalidated = 0` enforces
one valid lock per shoe+target). The `SqliteSessionStore` (native, authoritative) and
`MemorySessionStore` (web AsyncStorage fallback) enforce lock-before-result + transactional
result submission + deterministic recovery, with 17 DB-backed tests.

**Impact:** none — session state now persists on disk and reconstructs safely after restart.
**Note:** the older DB-001 `predictions` / `module_results` / `sequences` scaffolding is
**legacy / non-authoritative** for the M5 runtime (kept, never dropped).

### 18. Financial tracking is fixed-unit paper only
No martingale, no compensation, no automatic progression — a single flat unit per
PLAYED step, net units for paper P/L. Uncalibrated MVP.

**Impact:** none. **Action:** revisit if real staking models are ever required.

## No functional defects
All verification gates pass (see `docs/TEST_PLAN.md` and `docs/CURRENT_STATE.md`).
