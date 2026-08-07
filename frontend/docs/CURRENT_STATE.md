# Current State

**Current milestone:** 5 — Live Workflow & Session Tracker. **Status: IN PROGRESS — READY FOR FINAL ACCEPTANCE AUDIT.**
- **M5A (domain core): COMPLETE** — pure session engine (locking, evaluation, three-win tracker, revision invalidation, serialize/reconstruct).
- **M5B (domain hardening + persistence): COMPLETE** — domain hardening (PLAYER+BANKER coverage, exact sequence literals, future-leakage/lock-before-result, canonical deep-freeze on reconstruction, active+shadow audit) **plus DB-002 persistence**: a `session_state` cursor table + a `locked_prediction_entries` table storing the immutable lock payload with queryable lifecycle columns, a DB partial-unique index (one valid lock per shoe+target), revision linkage, lock-before-result + transactional result submission, and native (SQLite/DB-002) + web (AsyncStorage) session stores.
- **M5C (live workflow / UI): IMPLEMENTED** — Active Shoe wired to the persisted session via `useLiveSession` + `LiveSessionPanel`: Start Live / Start Historical Test, persisted **LOCKED** prediction display (decision / confidence-score / category / risk), PLAYED–NOT_PLAYED operator control, actual **P/T/B routed to the store** (lock-before-result gated; never a history append in a forward session), engine-vs-played progress + fixed-unit paper, and **live-mode Review Data edit/delete routed through `SessionStore.editHistory`/`deleteHistory`** (invalidation + renumber + rebuild) with the raw-round views (roadmap / stats / review list) sourced from the authoritative live session. **Native fail-safe:** `createSessionStore` throws `SessionPersistenceUnavailableError` if SQLite/DB-002 cannot initialize — it NEVER silently downgrades to a volatile store; actual input is disabled unless a healthy store + a valid persisted lock exist. **Native SQLite runtime not yet device-verified.**
- **Database:** **DB-002 current** (additive, forward-only). **DB-001** is a historical accepted migration, **unchanged**. DB-002 schema **unchanged** this task (M5C added no migration).
**Milestone 6: NOT STARTED** — advanced statistics & export (none built yet).
**Milestone 5 built the live/historical session engine** (pure domain): manual
one-result-at-a-time workflow, prediction **locking** (immutable), result
evaluation (WIN/LOSS/PUSH/SKIPPED/INVALIDATED), three-win tracker (engine +
played, 3 profiles), history-revision invalidation, fixed-unit paper tracking, and
serialize/restart reconstruction. Predictions are locked BEFORE their result
(Principle #5). **No automated replay; no advanced statistics/export.**
**Database schema version:** DB-001 (unchanged)
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

## Verification (this milestone)
- `npm run typecheck` → pass · `npm run lint` → pass (**0 errors / 0 warnings**)
- `npm test` → **13 suites, 242 tests**. M5C continuation adds: `session-workflow.test.ts` 12→**22** (live revision edit/delete invalidation, engine-vs-played reconstruct-from-valid-only, revision persistence survival, no-duplicate-valid-lock, TransactionGuard rapid-duplicate rejection, PARTIAL⇒UNKNOWN / COMPLETE⇒NO pair persistence, PP/BP auto-reset), `session-persistence.test.ts` 17→**18** (native DB-002 delete-history renumber + invalidation + valid-lock recovery), and new `session-factory.test.ts` **×3** (web memory adapter; native SQLite success; native init failure ⇒ `SessionPersistenceUnavailableError`, never a memory store).
  Per-file: smoke 6 · engine 10 · roadmap 26 · database 15 · history 22 · analysis 28 · reliability 13 · decision 18 · decision-audit 17 · session 44 · session-persistence 18 · session-workflow 22 · session-factory 3.
- `test:roadmap` → 26 · `test:engine` → 10 · `expo-doctor` → 18/18
- **M5C interaction validation (web preview / MemorySessionStore, 1280×800):** Start Live → LOCKED target + decision/confidence/category; PLAYED/NOT_PLAYED; actual P/T/B evaluation; **Tie → PUSH** (verified on a BET decision); engine/played progress + paper; **reload restores the exact pending target**; Review Data **edit + delete during live** rebuild roadmaps/stats; **New Shoe fully resets** to History Input; zero console errors / rejections / React key warnings (only the expected AsyncStorage web diagnostic). Native SQLite runtime NOT verified from a browser.
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
