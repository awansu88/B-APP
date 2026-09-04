# Known Issues

## M7.1 Patch 2 — DECISION-002 (BALANCED) + Derived Road ACTIVE + Profile Comparison (IMPLEMENTED)

### P2-1. BALANCED (DECISION-002) is EXPERIMENTAL
BALANCED activates the Derived Road analyzer (STRUCTURE family) while keeping every accepted DECISION-001
gate unchanged (no threshold/band change; VOTE-001/CONF-001/RISK-001 unchanged; reliability 0.30). It is
labeled Experimental and is NOT the default. **Impact:** none unless the operator explicitly selects it.

### P2-2. Section-15 result — Derived Road activation did NOT flip any decision in valid fixtures
Across the tested fixtures the ACTIVE Derived Road raised BALANCED confidence on some shoes (e.g. "doubles":
STRICT SKIP 0.50 vs BALANCED SKIP 0.54) but never crossed the UNCHANGED BET threshold (no STRICT-SKIP →
BALANCED-BET / case C) and never opposed STRICT's side (no case D). This is expected — the threshold was not
lowered in Patch 2. **Impact:** BALANCED currently rarely diverges from STRICT on the official decision;
divergence is mostly a confidence delta. **Action:** none (a threshold study would be a future patch).

### P2-3. Comparison telemetry only exists for Patch-2+ locks (NOT_AVAILABLE for older)
`profileComparison` is written at lock time from Patch 2 onward. Pre-Patch-2 LockedPredictions have no
telemetry and are reported `NOT_AVAILABLE` (excluded from the per-profile denominators; never regenerated).
**Impact:** cosmetic. **Action:** none.

### P2-4. Reconstruct recovery of a MISSING pending lock defaults to STRICT
The rare recovery path in `SqliteSessionStore` that regenerates a *missing* pending lock does so under the
default STRICT profile (the per-session engine profile is a live UI preference, not persisted per session, to
avoid a DB-002 schema change). Normal reload restores the existing pending lock verbatim (no regeneration), so
this only affects a crash mid-transaction. **Impact:** negligible. **Action:** persist per-session profile only
if a future patch needs it (would touch session_state columns).

### Shoe-completion readiness audit (section 16): SHOE_COMPLETION_PATCH_REQUIRED = NO
`New Shoe` (`HistoryStore.startNewShoe`) already sets the previous shoe to `ShoeStatus.ARCHIVED`, and
`countCompletedShoes` already counts ARCHIVED — DB-002 fully represents completion with no schema change. The
Patch-1 "completedShoes = 0" observation was simply because the test session never started a second shoe. The
smallest recommended change before Patch 3 is optional: surface an explicit "Complete Shoe" affordance (or
auto-archive an ACTIVE shoe once ended) so `completedShoes` climbs toward the 100-shoe eligibility without
relying on manual New Shoe. (Corrects the earlier P1-1 note that implied completion was unwired.)



### P1-1. Historical Matcher "Completed Shoes" stays at 0 until a shoe-completion step exists (by design)
`countCompletedShoes` counts shoes with `ShoeStatus` COMPLETED/ARCHIVED (DB-002 semantics). The accepted
workflow does not yet transition a shoe out of ACTIVE, so Completed Shoes reads **0 / 100** until a
shoe-completion step is added in a later patch. Non-Tie Rounds counts correctly. Eligibility therefore
reports **COLLECTING**. **Impact:** none — readiness is display-only and **does NOT activate matcher voting**
(voting is DISABLED in DECISION-001 regardless of eligibility). **Action:** none for this patch.

### P1-2. Historical locked-prediction payloads may lack a stored trace → SKIP reason NOT_AVAILABLE
Decision Availability reads the **verbatim** stored locked-prediction payload; predictions locked before
trace capture have no `reasonCodes`/`riskFlags`, so their SKIP reason is reported as **NOT AVAILABLE**
(counted in `traceUnavailable`). Historical predictions are **never regenerated**. **Impact:** cosmetic only.
**Action:** none.

### P1-3. BALANCED / DECISION-002 is a disabled placeholder (NOT IMPLEMENTED)
The Engine Mode card shows STRICT (DECISION-001) active and BALANCED — Experimental as a visibly disabled,
non-selectable chip ("Not enabled in this patch"). DECISION-002 is intentionally NOT implemented in Patch 1.
**Impact:** none. **Action:** Patch 2 (requires explicit authorization).

### P1-4. Preferences are AsyncStorage-only (web-preview diagnostic expected)
`usePreferences` persists two presentation toggles via AsyncStorage; on the web preview the expected
AsyncStorage diagnostic message appears in the console and is NOT a failure. No engine value or DB schema is
touched (DB-002 unchanged; NO DB-003). **Impact:** none. **Action:** none.



## Milestone 7A (IMPLEMENTED — final UI/UX + release QA + Android build readiness)

### M7A-1. Native SQLite/DB-002 transactional Merge/Restore + restart still NOT runtime-verified
Unchanged from M6: `applyMerge` / `restoreBackup` / session persistence are covered by in-memory
sql.js Jest tests and web-preview read-only projection, but have NOT been run on a physical Android
build+restart. Status remains **IMPLEMENTED_NOT_RUNTIME_VERIFIED**. **Action:** the M7B device QA
checklist (Basic persistence / Revision / Backup-Restore / Merge — see `docs/HANDOFF.md`) must pass
on a real Samsung Galaxy Tab S7 FE build before this is upgraded and Milestone 7 is marked COMPLETE.
Do NOT claim physical Android verification without real device evidence.

### M7A-2. History screen is a READ-ONLY browser (by design)
The History route (`src/app/(shell)/history.tsx`) lists persisted shoes + the selected shoe's raw
rounds (deterministic order) from the read-only dataset seam (`useBappData`). It intentionally has
NO edit/delete and never recomputes historical predictions — all editing/revisions remain in
Active Shoe → Review Data (accepted History Input / revision semantics unchanged). **Impact:** none.
**Action:** none.

### M7A-3. Settings screen is a READ-ONLY About / System Info (no engine controls)
The Settings route (`src/app/(shell)/settings.tsx`) shows identity, version registry, DB-002, the
active persistence adapter, the offline model and a secondary Engine/System Status card. There are
NO controls to change analyzer modes, reliability, voting, confidence thresholds, risk rules, the
Historical Matcher / Derived Road / Volatility modes or the database schema (all locked/versioned).
**Impact:** none. **Action:** none.

### M7A-4. `PlaceholderScreen` component is now orphaned (harmless)
`src/ui/PlaceholderScreen.tsx` is no longer imported by any route (History and Settings replaced it).
It is dead code kept in place; it is not bundled into any screen and not linted as an unused import.
**Impact:** none. **Action:** optional removal in a later pass.


## Milestone 6 (COMPLETE — accepted; tag `m06-data-management-rc1`)

### M6-1. Native SQLite/DB-002 transactional Merge/Restore not runtime-verified
`applyMerge` and `restoreBackup` (`src/data/backup/sqlite-gateway.ts`) are covered by
in-memory **sql.js** Jest tests (independent-shoe merge, unsafe-plan rejection, rollback on
mid-transaction failure, full backup→restore→compare, roadmap/sequence/paper reconstruction,
restore rollback). They are **not yet run on a physical Android build+restart** — status
**IMPLEMENTED_NOT_RUNTIME_VERIFIED** (do NOT claim physical Android verification). **Impact:**
none for web preview; this is an **accepted known limitation** carried past M6 acceptance.
**Action:** verify on a physical Android build+restart during Milestone 7 device bring-up.

### M6-2. Web preview cannot perform destructive Merge/Restore writes (by design)
Per the approved web policy (option b), the web-preview data source is READ-ONLY for writes:
`applyMerge`/`restore` throw `WriteUnavailableError` ("Available on native SQLite runtime") and
the UI disables + labels those actions. Validate + Merge-preview + Export remain fully enabled and
perform ZERO writes. **Impact:** intentional; web never fakes a destructive write. **Action:** none.

### M6-3. Export/Import UI is dependency-free (in-app JSON + paste)
No file-IO deps (`expo-file-system`/`expo-sharing`/`expo-document-picker`/clipboard) were added,
to keep expo-doctor and the web bundle unchanged. Export shows a serialized JSON preview; import is
via a paste box. **Impact:** no OS file save/share or file-picker in the MVP. **Action:** optional
native file save/share + document-picker can be added in a later pass (not required for M6 logic).

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

### 17c. Accidental rapid double-tap in LIVE mode is now guarded (Section 12)
A live session enters results one-at-a-time (observe outcome → pick PLAYED/NOT_PLAYED →
tap), so an accidental physical double-tap could previously let the tail tap silently
become the actual result for the *next* round. A `DuplicateInputGuard` (~400ms re-arm,
`src/domain/history/duplicate-input-guard.ts`) now gates the **live** result button:
the first tap is accepted immediately; a second tap within the window is rejected; a
deliberate tap after the window submits the next round normally. The concurrent-case
`TransactionGuard` still protects an in-flight submission. **Protection semantics:**
first-tap-immediate, then reject-within-400ms, then re-arm. The guard is **scoped to
LIVE mode only** — History-Input bulk transcription is NOT throttled (fast ~200ms manual
entry registers every round). Verified end-to-end (live double-tap and 4-tap burst each
add exactly one round; History-Input 12/12 at ~200ms).

**Impact:** none (data-integrity improvement). **Action:** none.

### 17d. Native SQLite/DB-002 persistence is IMPLEMENTED_NOT_RUNTIME_VERIFIED
The native SQLite/DB-002 session store is implemented and covered by sql.js-backed
persistence tests + the fail-safe factory test, but has NOT been executed on a physical
Android device/runtime across a real app restart. The web preview uses the
AsyncStorage-compatible `MemorySessionStore` (browser evidence does NOT prove the native
SQLite runtime). Native init failure is fail-safe (throws `SessionPersistenceUnavailableError`;
never a silent volatile downgrade).

**Impact:** recorded known limitation; not a Milestone-5 code blocker. **Action:** verify
on an Android build + restart before relying on native durability in production.

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

## HMATCH-002 production promotion
No known code-level blocker remains for official matcher voting. Physical-device
SQLite restart verification remains part of the pre-existing M7B limitation; no
APK/device validation was performed by this patch.
