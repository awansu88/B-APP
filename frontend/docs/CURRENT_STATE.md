# Current State

**Current milestone:** 7 — Final UI/UX, Release QA & Android build readiness. **M7A: IMPLEMENTED — READY FOR ANDROID BUILD / DEVICE QA.** Milestone 6 remains COMPLETE (release-candidate tag `m06-data-management-rc1`); completed milestone: 6. **Milestone 7 is NOT COMPLETE** — M7B (Android test build / APK, physical-device verification, native SQLite restart/Merge/Restore verification, final release acceptance) is PENDING explicit authorization.

## M7.1 Patch 2 — DECISION-002 (BALANCED) + Derived Road ACTIVE + Profile Comparison (IMPLEMENTED)
Versioned analyzer-activation profiles. **STRICT / DECISION-001 remains behaviorally identical** (verified: 305-test baseline all green; `src/domain/decision/{voting,confidence,risk,config}` and analysis module math unchanged).
- **`src/domain/decision/profiles.ts`** — `STRICT_PROFILE` (DECISION-001, ACCEPTED, default, derived SHADOW_ONLY, `modules = ALL_MODULES`) and `BALANCED_PROFILE` (DECISION-002, EXPERIMENTAL, derived ACTIVE, `modules = ALL_MODULES` with derived-road → `derivedRoadAnalyzerActive`). Profiles expose only `{id, decisionVersion, status, derivedRoad, modules}` — **no numeric-tuning surface**. `DEFAULT_ENGINE_PROFILE_ID = 'STRICT'`.
- **`src/domain/analysis/modules.ts`** — refactored the derived-road analyzer into `analyzeDerivedRoad(ctx, status)` shared by the SHADOW_ONLY `derivedRoadAnalyzer` (STRICT, byte-identical trace incl. the SHADOW_ONLY reason code) and the ACTIVE `derivedRoadAnalyzerActive` (BALANCED). `computeVoting` already includes any ACTIVE directional module and already handles the STRUCTURE family (weight 1) — **VOTE-001 unchanged**.
- **`runDecisionPipeline(ctx, config, profile=STRICT)`** runs analysis with the profile registry and stamps the profile's decision version (STRICT → DECISION-001 identity; BALANCED → DECISION-002); voting/confidence/risk math untouched.
- **`computePrediction(..., { profile })`** computes BOTH profiles pre-result from the same snapshot, builds the OFFICIAL lock from the selected profile, and attaches immutable `profileComparison` (`PROFILECMP-001`: `{selectedProfile, strict, balanced}`) — stored verbatim in the LockedPrediction JSON payload (session store + `locked_prediction_entries.payload`). Backward compatible; pre-Patch-2 payloads → NOT_AVAILABLE.
- **Observability** (`decision-observability.ts` / `dataset-observability.ts`) — `computeProfileComparisonFromDataset` reports per-profile availability (BET/SKIP/side via new `betPlayer`/`betBanker`) + observed W/L/P (`WIN/(WIN+LOSS)`, PUSH & INVALIDATED excluded), plus `available`/`notAvailable` (NOT_AVAILABLE for pre-Patch-2). Comparison telemetry is independent of the played/paper ledger.
- **Preferences** (`use-preferences.ts`) — `engineMode` (default STRICT) + `showDecisionComparison` (renamed from showDecisionDetails), AsyncStorage-only, plus a synchronous `getEngineMode()` for the store. Selection survives reload.
- **UI** — Settings: Engine Mode now selectable (STRICT / BALANCED — Experimental), matcher Voting = "DISABLED — PATCH 3". Live: ENGINE MODE banner + exactly ONE official recommendation + optional secondary Profile-Comparison section (pref-gated, labeled control telemetry). Statistics: `ProfileComparisonCard` (STRICT vs BALANCED availability + observed W/L/P, or NOT_AVAILABLE), never described as accuracy/win-probability.
- **Lock-safety:** switching engineMode never rewrites/duplicates an already-locked target; reconstruct restores pending locks verbatim (no regeneration). Explicit tests A–E.
- **Verification:** typecheck PASS · lint 0/0 · `npm test` **21 suites / 343 tests** (305 baseline + 38 new) · roadmap 26 · engine 10 · expo-doctor 18/18 · **DB-001/DB-002 UNCHANGED · NO DB-003** · package-lock + app.json UNCHANGED · **NATIVE_BUILD_IMPACT = NONE**.
- **Targeted frontend validation (1280×800) — ALL PASS:** Settings (both modes selectable, no crash, no tuning knobs, Voting DISABLED — PATCH 3); Live (ENGINE MODE banner STRICT→BALANCED, one recommendation, secondary comparison with `Show Decision Comparison` ON, 400ms guard = one round); Statistics (Profile Comparison STRICT 1/4 vs BALANCED 0/4 BET availability + observed W/L/P; proper disclaimers). Console clean apart from expected AsyncStorage diagnostic.
- **Section-15 (honest):** Derived Road activation influences BALANCED (e.g. doubles SKIP 0.50 → 0.54) but did NOT convert a STRICT SKIP into a BALANCED BET (no case C) nor flip sides (no case D) in valid fixtures — consistent with the unchanged threshold.
- **Shoe-completion readiness audit:** `SHOE_COMPLETION_PATCH_REQUIRED = NO` — `New Shoe` already archives the previous shoe (`ShoeStatus.ARCHIVED` via `HistoryStore.startNewShoe`), and `countCompletedShoes` counts ARCHIVED. DB-002 already represents completion; Patch-1 showed 0 only because the test never started a 2nd shoe. Smallest future change for Patch 3: optionally expose a "Complete Shoe" affordance / auto-archive so completedShoes climbs toward 100 without relying on manual New-Shoe.
- **Milestone 7 still NOT COMPLETE. Patch 3 (Historical Matcher voting) NOT STARTED. M7B pending. Recommended next checkpoint tag: `m07-decision-expansion-wip2`.**

 **DECISION-001 behavior UNCHANGED** — no threshold lowered, no analyzer weight changed, no confidence math changed, no family-correlation changed, no risk semantics changed, no LockedPrediction semantics changed. No files under `src/domain/{decision,analysis,session,config}` changed.
- **`src/domain/observability/*`** (pure, deterministic):
  - `decision-observability.ts` — non-actionable **Directional Lean** (PLAYER/BANKER/NONE + evidence share from the stored independent player/banker scores; explicitly NOT a probability/win-rate/accuracy), a stable **SKIP reason** enum with deterministic precedence (`deriveSkipDiagnostic`), **Decision Availability** aggregate with explicit denominators (`computeAvailability`: eligible / bet / skip / betRate / skipRate / lean counts / skip-reason counts / traceUnavailable), `topSkipReasons`, and **Historical Matcher readiness** (`computeMatcherReadiness`: ELIGIBLE ⇔ completedShoes ≥ 100 AND nonTieRounds ≥ 5,000; `votingEnabled: false` always; readiness NEVER activates voting).
  - `dataset-observability.ts` — adapters over the accepted read-only `BappDataset` / live `LockedPrediction`; reads the **verbatim** stored locked-prediction payload trace (`reasonCodes` / `riskFlags` / `playerScore` / `bankerScore`); missing trace ⇒ `NOT_AVAILABLE` (historical predictions never regenerated).
- **`src/workflows/preferences/*`** — `usePreferences` external store persisted via AsyncStorage only: `showDirectionalLean` (default ON), `showDecisionDetails` (default OFF). Presentation-only; touches NO engine values and NO DB schema (DB-002 unchanged).
- **UI:** Settings gains a **Display Preferences** card (two switches), an **Engine Mode** card (**STRICT = DECISION-001 active**; **BALANCED — Experimental** is a visibly disabled, non-selectable placeholder — DECISION-002 NOT implemented), and a **Historical Matcher** card (Completed Shoes N/100, Non-Tie Rounds N/5,000, Eligibility COLLECTING|ELIGIBLE, Voting DISABLED IN DECISION-001). No numeric engine-tuning knobs. Live panel shows Directional Lean + Why-Skip on a SKIP (pref-gated, labeled informational/non-actionable; official decision stays SKIP) and a compact decision-details/family trace (pref-gated). Statistics gains a **Decision Availability** + **Top SKIP Reasons** + **Historical Matcher** section (labeled availability, NOT accuracy / win probability). The 400ms live-only duplicate-input guard and unthrottled History Input are UNCHANGED.
- **Historical Matcher:** data collection/readiness VISIBLE; **voting DISABLED** (no vote even when ELIGIBLE). **Derived Road: SHADOW_ONLY.** **BALANCED / DECISION-002: NOT IMPLEMENTED.**
- **Verification:** typecheck PASS · lint **0/0** · `npm test` **18 suites / 305 tests** (277 baseline preserved + 28 new `decision-observability.test.ts`) · `test:roadmap` 26 · `test:engine` 10 · `expo-doctor` 18/18 · package-lock + app.json + DB-001/DB-002 UNCHANGED · **NO DB-003**. **NATIVE_BUILD_IMPACT = NONE.**
- **Targeted frontend validation (testing agent, 1280×800) — ALL PASS:** Settings (two switches toggle without crash; STRICT active; BALANCED disabled; no tuning knobs; Matcher 0/100, 0/5,000, COLLECTING, Voting DISABLED). Live (SKIP observed; Directional Lean BANKER labeled informational, Why-Skip shown, official decision still SKIP; Decision Details trace appears with pref ON; double-tap adds exactly ONE round). Statistics (Decision Availability eligible=2 / BET=0 / SKIP=2 / BET availability "0 / 2 (0.0%)" / SKIP 100% / lean 1/1/0; disclaimer "availability, not accuracy or a win probability"; Matcher 0/100, 12/5,000, COLLECTING). Console clean apart from the expected AsyncStorage web-preview diagnostic.
- **Matcher readiness (web-preview dataset):** completedShoes = 0, nonTieRounds = 0 (fresh) → **COLLECTING**. NOTE: completedShoes counts ShoeStatus COMPLETED/ARCHIVED; the accepted workflow does not yet transition shoes out of ACTIVE, so this stays 0 until a shoe-completion step is added in a later patch (documented known limitation; readiness state does not activate voting regardless).
- **Milestone 7 is still NOT COMPLETE. M7B still pending. Patch 2 / DECISION-002 NOT STARTED.**

- **M5A (domain core): COMPLETE** — pure session engine (locking, evaluation, three-win tracker, revision invalidation, serialize/reconstruct).
- **M5B (domain hardening + persistence): COMPLETE** — domain hardening plus DB-002 persistence (`session_state` cursor + `locked_prediction_entries` immutable lock payload; partial-unique index for one valid lock per shoe+target; revision linkage; lock-before-result + transactional submission; native SQLite/DB-002 + web AsyncStorage stores).
- **M5C (live workflow / UI): COMPLETE** — Active Shoe wired to the persisted session via `useLiveSession` + `LiveSessionPanel`: Start Live / Start Historical Test, persisted **LOCKED** prediction display (decision / confidence-score / category / risk), PLAYED–NOT_PLAYED, actual **P/T/B routed to the store** (lock-before-result gated; no history append in a forward session), engine-vs-played progress + fixed-unit paper, **live-mode Review Data edit/delete via `SessionStore.editHistory`/`deleteHistory`** (invalidate + renumber + rebuild; raw-round views sourced from the authoritative live session), **native fail-safe** (`createSessionStore` throws `SessionPersistenceUnavailableError`, never a silent volatile downgrade), and a **live-only accidental double-tap guard** (`DuplicateInputGuard`, ~400ms re-arm) that never throttles History-Input bulk entry.
- **Native persistence status: A. IMPLEMENTED_NOT_RUNTIME_VERIFIED** — SQLite/DB-002 path implemented + covered by sql.js + fail-safe factory tests; not yet run on a physical Android device/restart (recorded known limitation, not a code blocker).
- **Database:** **DB-002 current** (additive, forward-only). **DB-001** unchanged. DB-002 schema **unchanged** in the final audit.
**Milestone 6: COMPLETE — final acceptance audit PASSED** (release-candidate tag `m06-data-management-rc1`).
Statistics + Export/Import/Merge + Backup/Restore + Diagnostics. Local-first; no cloud
sync; **no prediction-engine changes**; **DB-002 sufficient — NO DB-003**.
- **Statistics** (`src/domain/statistics/*`): pure `computeFullStatistics(BappDataset)` →
  Overall, Predictions, Results, Confidence Categories, Player-vs-Banker, Engine Sequence,
  Played Sequence, Revisions. Three-win + fixed-paper REUSE accepted M5 `advanceSequence` /
  `applyPaper` (per-shoe reset; never crosses shoe boundaries). Explicit denominators:
  win rate = WIN/(WIN+LOSS); PUSH/SKIPPED/INVALIDATED excluded from valid performance.
- **Export** (`src/domain/backup/format.ts`): self-describing `BAPP-EXPORT` / `EXPORT-001`
  with metadata + counts; FULL_BACKUP / HISTORY / ANALYSIS. **Validation** (`validate.ts`)
  is ZERO-write. **Merge** (`merge.ts`): duplicate-skip / conflict-reject / independent-import,
  one valid lock per shoe+target, with a merge report + `safe` flag.
- **Backup/Restore + Merge apply** (`src/data/backup/sqlite-gateway.ts`): transactional over
  SQLite/DB-002 with rollback; payloads copied verbatim (locked predictions never regenerated).
- **Diagnostics** (`src/domain/diagnostics/integrity.ts`): read-only integrity (orphan rounds,
  broken revision links, duplicate valid-lock, round continuity, counts, adapter). No auto-repair.
- **Web policy (approved option b):** Statistics/Export/Validate/Merge-preview/Diagnostics
  enabled on web preview (validate + preview ZERO writes). Actual Merge/Restore **writes** are
  native-SQLite only (`WriteUnavailableError`; UI shows "Available on native SQLite runtime").
- **Native status:** IMPLEMENTED_NOT_RUNTIME_VERIFIED (transactional Merge/Restore covered by
  sql.js Jest; not run on a physical Android build+restart).
- **Verification (Milestone 6 final acceptance):** typecheck PASS · lint **0 errors / 0 warnings** ·
  `npm test` → **17 suites / 277 tests** (M6 adds `statistics` 9 · `backup-export` 17 · `backup-restore` 3) ·
  `test:roadmap` 26 · `test:engine` 10 · `expo-doctor` 18/18 · package-lock + DB-001/DB-002 schema UNCHANGED.
**Milestone 7 — M7A IMPLEMENTED (final UI/UX + release QA + Android build readiness).**
- **Two former Milestone-0 placeholder routes are now REAL read-only screens:**
  - **History** (`src/app/(shell)/history.tsx`): read-only Shoe History / Raw Records browser
    over the accepted read-only dataset seam (`useBappData`) — shoe list (active shoe flagged),
    selected shoe's raw rounds in deterministic `roundNumber` order (P/T/B chips + PP/BP tags),
    empty/loading/error + web-preview banners. NO writes, NO edit/delete, NEVER recomputes
    predictions (editing/revisions stay in Active Shoe → Review Data).
  - **Settings** (`src/app/(shell)/settings.tsx`): read-only Settings / About / System Info —
    Application (version, package, orientation, target device), Data & Persistence (DB-002 +
    active adapter + offline model), and a SECONDARY Engine/System Status card (locked version
    registry, analyzer modes with Historical Matcher DISABLED + Derived Road/Volatility
    SHADOW_ONLY, thresholds). NO configuration controls.
- **Active Shoe tablet-landscape polish (restrained; no redesign):** boards ScrollView content
  `flexGrow:1`; `RoadmapBoards` groups Bead Plate + Big Road at the top and anchors the derived
  roads at the bottom near the controls (single intentional gap, not a detached blank); cell sizes
  bumped for readability (BEAD 26→30, BIG 24→28, DERIVED 15→18). P/T/B order + large touch targets,
  roadmap ALGORITHMS/data, the 400ms live-only guard, and unthrottled History Input are ALL UNCHANGED.
- **Verification:** typecheck PASS · lint 0/0 · **17 suites / 277 tests** (unchanged — UI-only additions;
  no new tests required) · roadmap 26 · engine 10 · expo-doctor 18/18 · package-lock + DB-001/DB-002
  UNCHANGED · NO DB-003. Frontend testing agent: M7A interaction matrix ALL PASS at 1280×800 (History/
  Settings real read-only; Active Shoe + Statistics/Export/Diagnostics regression; zero console errors).
- **Android config review:** landscape orientation, package `com.bapp.baccaratengine`, empty
  `android.permissions` (offline app needs none), expo-sqlite plugin present, icons/splash present,
  native adapter = SQLite/DB-002. **ANDROID_BUILD_READY = YES** (build itself is M7B).
- **Native SQLite/DB-002 status UNCHANGED: IMPLEMENTED_NOT_RUNTIME_VERIFIED** (no physical Android
  runtime evidence yet). **M7B NOT STARTED.**
**Milestone 7: NOT COMPLETE (M7A only).**
**Milestone 5 built the live/historical session engine** (pure domain): manual
one-result-at-a-time workflow, prediction **locking** (immutable), result
evaluation (WIN/LOSS/PUSH/SKIPPED/INVALIDATED), three-win tracker (engine +
played, 3 profiles), history-revision invalidation, fixed-unit paper tracking, and
serialize/restart reconstruction. Predictions are locked BEFORE their result
(Principle #5). **No automated replay; no advanced statistics/export.**
**Database schema version:** DB-002 (current) — DB-001 remains the accepted historical/base migration, unchanged
**App:** 0.1.0 · **Engine:** ENGINE-001 · **Config:** CFG-001 · **Roadmap:** ROADMAP-001
· **Snapshot:** SNAPSHOT-001 · **Feature:** FEATURE-001 · **Voting:** VOTE-001 ·
**Confidence:** CONF-001 · **Risk:** RISK-001 · **Decision config:** DECISION-001 ·
**Session:** SESSION-001

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

## Historical note (Milestone 2/3 scope boundary — superseded)
- Milestones 2–3 deliberately shipped **no** final voting, confidence scoring, risk
  decisions, or prediction locking. Those were later delivered by **Milestone 4**
  (decision pipeline) and **Milestone 5A/5B** (prediction locking + evaluation, pure
  domain). The legacy M0 placeholders `categorizeConfidence` / `evaluateStep` /
  `evaluateThreeWinSequence` still throw and are **superseded** by the decision +
  session modules (kept only to avoid touching M0 surface).
- Historical Matcher remains a **disabled interface** (never computed).
- Volatility & Derived Road analyzers remain **SHADOW_ONLY** (computed, never influence
  the active decision; captured in the locked prediction's shadow audit only).
- Statistics/Export/Diagnostics/Settings routes remain Milestone 0 placeholders; the
  History Input UI (Milestone 2) is unchanged. The **session engine is not yet wired to
  any screen** (Milestone 5C).

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

## Milestone 5 (new — Live Workflow & Session Tracker, pure domain)
- **`src/domain/session/*`** (deterministic, no IO/persistence coupling): `types.ts`
  (SESSION-001; WorkflowState, SessionProfile, OperatorAction, StepResult, LockedPrediction,
  SessionState, PersistedSession), `engine.ts` (`computePrediction` → immutable
  deep-frozen lock, `evaluatePrediction`, three-win `advanceSequence`/`advanceProfileMap`),
  `live-session.ts` (`startSession`, `submitResult`, `editHistory`, `newShoe`,
  `serializeSession`, `reconstructSession`).
- **Environments:** LIVE_FORWARD and HISTORICAL_TEST share the same manual,
  one-result-at-a-time workflow (no automated replay).
- **Workflow states:** HISTORY_INPUT · READY_TO_START · COMPUTING_PREDICTION ·
  WAITING_FOR_RESULT · EDITING_HISTORY · SHOE_CLOSED · ERROR_RECOVERY.
- **Prediction lock (immutable):** recommendation, confidence, category, module
  outputs, risk flags, all engine/config versions, and target round are captured
  and **deep-frozen** before the result; they can never silently change.
- **Result submission (transactional):** validate target round → save actual →
  evaluate locked prediction → update sequences/paper → build & lock the next
  prediction. Duplicate/out-of-order input is rejected without partial application.
- **Evaluation:** correct P/B → WIN; incorrect → LOSS; Tie → PUSH; official SKIP →
  SKIPPED; revision-affected → INVALIDATED.
- **Three-win tracker:** 3 consecutive valid wins within one shoe; SKIP/PUSH are
  no-ops; LOSS resets; New Shoe ends an unfinished sequence. Tracked separately for
  **engine** vs **played** across profiles EXPERIMENTAL_PLUS / QUALIFIED_PLUS / HIGH_ONLY.
- **Editing live history:** creates a revision, invalidates affected predictions
  (target round ≥ edited round), rebuilds sequences from survivors, and re-locks a
  fresh prediction — the old audit trail is never deleted.
- **Financial MVP:** fixed unit, paper tracking only (no martingale / compensation /
  progression). **Restart reconstruction:** `serializeSession`/`reconstructSession`
  rebuild sequences + current locked prediction deterministically.
- No future result may enter a snapshot (predictions are computed only from
  completed rounds before the target). No advanced statistics/export (Milestone 6).

## Verification (Milestone 5)
- `npm run typecheck` → pass · `npm run lint` → pass (**0 errors / 0 warnings**)
- `npm test` → **14 suites, 248 tests**. Final acceptance adds `input-safety.test.ts` **×6** (DuplicateInputGuard: first tap accepted, accidental rapid second/burst rejected, deliberate tap after the re-arm window accepted, `reset()` re-arms, and normal seconds-apart entry never blocked). M5C continuation earlier added: `session-workflow.test.ts` 12→**22**, `session-persistence.test.ts` 17→**18**, `session-factory.test.ts` **×3**.
  Per-file: smoke 6 · engine 10 · roadmap 26 · database 15 · history 22 · analysis 28 · reliability 13 · decision 18 · decision-audit 17 · session 44 · session-persistence 18 · session-workflow 22 · session-factory 3 · input-safety 6.
- `test:roadmap` → 26 · `test:engine` → 10 · `expo-doctor` → 18/18
- **M5 final-acceptance interaction validation (web preview / MemorySessionStore, 1280×800):** Start Live → LOCKED target + decision/confidence/category; PLAYED/NOT_PLAYED; actual P/T/B evaluation; **Tie → PUSH** (on a BET decision); engine/played progress + paper; **reload restores the exact pending target**; Review Data **edit + delete during live** rebuild roadmaps/stats; **New Shoe fully resets** to History Input; and the **live accidental double-tap guard** (rapid double-tap and a 4-tap burst each add exactly ONE round; a deliberate tap after ~400ms submits the next round; History-Input bulk entry at ~200ms is NOT throttled — 12/12 register). Zero console errors / rejections / React key warnings (only the expected AsyncStorage web diagnostic). Native SQLite runtime NOT verified from a browser.
- **Persistence (DB-002):** `session_state` (per-shoe workflow/cursor + paper cache)
  and `locked_prediction_entries` (immutable lock payload + queryable lifecycle
  columns; partial-unique `WHERE invalidated = 0`). Authority: raw rounds + revisions
  (DB-001) = baccarat history; locked entries = engine-decision audit; sequences +
  paper = DERIVED (rebuilt on reconstruct); `session_state` = cursor metadata only.
  Stores: `SqliteSessionStore` (native, authoritative) + `MemorySessionStore` (web
  AsyncStorage fallback) share one contract; no business logic in the adapters.
- `package-lock.json` unchanged; **DB-001 migration unchanged**; roadmap engine, thresholds, version
  registry, analyzer modes, reliability priors, decision pipeline, snapshot/feature
  layers, and History workflow/UI all UNCHANGED (only new `src/domain/session/*`
  files + additive `index.ts` re-exports + `src/tests/session.test.ts`).

## Milestone 4 (Decision Pipeline, pure domain)
- **`src/domain/decision/*`** (deterministic, no React/RN/Expo/IO, no persistence,
  no locking): `config.ts` (DECISION-001 baseline), `types.ts`, `families.ts`
  (Trend/Alternation/Context/Structure/Risk/Historical), `data-quality.ts`
  (PASS/LIMIT/BLOCK gate), `voting.ts` (independent Player/Banker weighted voting
  + family correlation cap + conflict detection), `confidence.ts` (evidence-depth
  confidence engine + locked 55/60/70/75 bands), `risk.ts` (risk flags + filter),
  `pipeline.ts` (`decide(...)` fixed-vector entrypoint + `runDecisionPipeline(ctx)`).
- **Pipeline:** Module Results → Data Quality Gate → Weighted Voting → Family
  Correlation Cap → Conflict Detection → Confidence Engine → Risk Filter →
  Prediction **Draft**, producing independent **ACTIVE** and **SHADOW** records.
- **Weighted agreement is a consensus ratio, NOT a win probability.** Confidence
  is driven by evidence depth (winner score), gated by agreement ≥ 58% and ≥ 2
  directional modules; clamped to 0.75.
- **Family correlation cap:** within-family discounted sum (w0 + 0.5·w1 + 0.25·w2…);
  CONTEXT (regime) family is multiplied by 0.5 so regime modifies context without
  blindly duplicating trend evidence.
- **Risk Filter** may retain / downgrade one category / turn BET→SKIP; it **never**
  reverses the side, raises a category, or increases confidence. Flags:
  LOW_MODULE_COUNT, SINGLE_FAMILY_SUPPORT, MODERATE_CONFLICT, STRONG_OPPOSITION,
  REGIME_TRANSITION, MEDIUM_DATA_QUALITY, RECENT_PATTERN_BREAK,
  LOW_SAMPLE_RELIABILITY, CONFIDENCE_NEAR_THRESHOLD.
- **Volatility SHADOW:** ACTIVE record ignores volatility; a separate SHADOW record
  re-evaluates whether volatility would downgrade/SKIP. Shadow is never the official
  recommendation. Historical Matcher stays DISABLED; Volatility & Derived Road stay
  SHADOW_ONLY (never vote).
- **Output/trace stores:** player & banker scores, weighted agreement, conflict
  score, family contributions, raw & final confidence, raw & final category, risk
  score/level/flags, active & shadow decisions, reason codes, and engine/config
  versions (VOTE-001, CONF-001, RISK-001, ENGINE-001, CFG-001, DECISION-001).

## Verification (Milestone 4)
- `npm run typecheck` → pass · `npm run lint` → pass
- `npm test` → **9 suites, 155 tests** (Milestone-4 build adds `decision.test.ts` ×18;
  the final acceptance audit adds `decision-audit.test.ts` ×17: family-cap
  permutation invariance (all 24 perms), ACTIVE/SHADOW isolation, DQG-vs-Risk
  ownership PASS/LIMIT/BLOCK (no double penalty), literal confidence boundaries
  0.55/0.60/0.70/0.75 + clamp, risk invariants (never flips side / raises category
  / raises confidence; ≤1-step downgrade; strong-opposition SKIP), and 4
  hand-calculated golden vectors). Per-file: smoke 6 · engine 10 · roadmap 26 ·
  database 15 · history 22 · analysis 28 · reliability 13 · decision 18 ·
  decision-audit 17.
- `test:roadmap` → 26 · `test:engine` → 10 · `expo-doctor` → 18/18
- **Active Shoe UI regression (frontend testing agent):** `loadActive()` resolves
  in ~0.28s; full UI renders (nav rail, roadmaps, P/T/B controls); round entry +
  roadmap update + reload persistence all work; zero console errors. The
  transient "Loading shoe…" seen in the raw screenshot sandbox is an IndexedDB
  timing artifact of that headless tool, not a regression.
- `package-lock.json` unchanged; roadmap engine, DB-001, engine thresholds, version
  registry, analyzer modes, reliability priors, and History workflow/UI all
  UNCHANGED (the audit added only `src/tests/decision-audit.test.ts`; no production
  code changed).

## Native persistence status
- **IMPLEMENTED_NOT_RUNTIME_VERIFIED** (Milestone 2; unchanged this milestone).

## HMATCH-002 production promotion

HMATCH-002 is now an official production voter. The matcher-enabled `BALANCED`
profile is the default and accepted production path; `STRICT` remains available
only as an internal legacy/control profile. Persisted `STRICT` UI preferences
migrate to production on hydration, while existing locked predictions remain
verbatim. New locks are identified by `ENGINE-002` and retain the already
matcher-aware `DECISION-003`/`DECISION-004` and `BALCFG-001` identifiers.

Settings reports the dynamic matcher as `ACTIVE — QUALITY GATED`; its static
`ALL_MODULES` placeholder remains disabled so it cannot create a duplicate vote.
Statistics readiness is derived from the same prepared production corpus as
runtime matching (`BAPP-CORPUS-001` plus eligible archived user shoes, excluding
the active shoe), so an empty user dataset reports 1,000 completed shoes and
66,086 non-Tie rounds. No corpus rows are persisted and DB-002 is unchanged.
