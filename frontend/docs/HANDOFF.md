# Handoff

**From:** Milestone 7A (Final UI/UX + Release QA + Android build readiness — IMPLEMENTED).
**To:** Next agent — Milestone 7B (Android test build / APK, physical-device verification, native
SQLite restart/Merge/Restore verification, final release acceptance) — NOT STARTED (needs explicit authorization).
**Milestone 6:** COMPLETE (tag `m06-data-management-rc1`). **Milestone 7 is NOT COMPLETE** (M7A only).
**Git repository root:** `/app`. **Expo app root:** `/app/frontend` (run all
commands from here). **Package manager:** npm (`package-lock.json`, unchanged).

## M7.1 Patch 2 — DECISION-002 (BALANCED) + Derived Road ACTIVE + Profile Comparison (IMPLEMENTED)
- **Status:** IMPLEMENTED + validated (regression gate + targeted UI ALL PASS).
- **Profiles:** STRICT (DECISION-001, ACCEPTED, default, derived SHADOW_ONLY) and BALANCED (DECISION-002, EXPERIMENTAL, derived ACTIVE). Only the analyzer-activation registry differs. **VOTE-001 unchanged; no threshold/band change; reliability 0.30 + STRUCTURE family unchanged.** Historical Matcher NO-VOTE and Volatility SHADOW_ONLY in BOTH profiles.
- **Files:** NEW `src/domain/decision/profiles.ts`, `src/ui/stats/ProfileComparisonCard.tsx`, `src/tests/{profiles,profile-stats,preferences}.test.ts`; CHANGED `src/domain/analysis/modules.ts` (shared derived-road helper + ACTIVE variant), `src/domain/decision/pipeline.ts` (+profile param), `src/domain/session/{types,engine}.ts` (+profileComparison), `src/domain/observability/{decision,dataset}-observability.ts` (+profile comparison + betPlayer/betBanker + observed W/L/P), `src/workflows/preferences/use-preferences.ts` (+engineMode/showDecisionComparison/getEngineMode), `src/workflows/session/{session-store,use-live-session}.ts` (thread profile), `src/app/(shell)/{settings,statistics}.tsx`, `src/ui/live/LiveSessionPanel.tsx`.
- **Immutable comparison payload:** `LockedPrediction.profileComparison` (`PROFILECMP-001`) holds both pre-result snapshots; stored verbatim; backward-compatible (pre-Patch-2 → NOT_AVAILABLE, never regenerated). Profile switch never rewrites a locked target.
- **Gate:** typecheck PASS · lint 0/0 · **21 suites / 343 tests** (305 baseline + 38 new) · roadmap 26 · engine 10 · expo-doctor 18/18 · DB-001/DB-002 UNCHANGED · NO DB-003 · package-lock + app.json UNCHANGED · **NATIVE_BUILD_IMPACT = NONE**.
- **Shoe-completion:** `SHOE_COMPLETION_PATCH_REQUIRED = NO` (New Shoe already archives previous → ARCHIVED counts as completed).
- **Recommended next checkpoint tag:** `m07-decision-expansion-wip2`. Milestone 7 still NOT COMPLETE; Patch 3 NOT STARTED; M7B pending.


- **Status:** IMPLEMENTED and validated (code regression gate + targeted frontend validation ALL PASS). A READ-ONLY explanatory layer only.
- **DECISION-001:** UNCHANGED — no threshold lowered, no analyzer weight changed, no confidence math changed, no family correlation changed, no risk semantics changed, no LockedPrediction semantics changed. Files under `src/domain/{decision,analysis,session,config}` were NOT touched.
- **Files added/changed (vs `m06-data-management`):** NEW `src/domain/observability/{decision-observability,dataset-observability,index}.ts`, `src/workflows/preferences/{use-preferences,index}.ts`, `src/tests/decision-observability.test.ts`; CHANGED (presentation only) `src/ui/live/LiveSessionPanel.tsx`, `src/ui/stats/{DecisionAvailabilityCard,StatsView}.tsx`, `src/app/(shell)/{settings,statistics,index,history}.tsx`, `src/ui/roadmap/RoadmapBoards.tsx`.
- **Decision Availability:** BET/SKIP counts with explicit numerator/denominator (bet/eligible), SKIP rate, directional-lean counts, Top SKIP Reasons (stable enum, deterministic precedence), Historical Matcher readiness. Labeled availability — NEVER accuracy or a future win probability.
- **Historical Matcher:** readiness VISIBLE (Completed Shoes / Non-Tie Rounds vs 100 / 5,000; COLLECTING|ELIGIBLE); **voting DISABLED IN DECISION-001** (no vote even when ELIGIBLE). Derived from authoritative shoes + rounds — **no separate matcher DB, NO DB-003.**
- **STRICT/BALANCED foundation:** STRICT (DECISION-001) active/selectable; **BALANCED — Experimental (DECISION-002) NOT IMPLEMENTED** (disabled placeholder). **Derived Road: SHADOW_ONLY.**
- **Gate:** typecheck PASS · lint 0/0 · **18 suites / 305 tests** (277 baseline + 28 new) · roadmap 26 · engine 10 · expo-doctor 18/18 · package-lock + app.json + DB-001/DB-002 UNCHANGED · NO DB-003 · **NATIVE_BUILD_IMPACT = NONE.**
- **Do NOT begin Patch 2 / DECISION-002 without authorization. Milestone 7 still NOT COMPLETE; M7B still pending.**


## Milestone 6 (this handoff)
- **Status:** **COMPLETE** — final acceptance audit PASSED (release-candidate tag `m06-data-management-rc1`). Completed milestone: **6**. Next: **Milestone 7 — NOT STARTED**.
- **Scope:** Statistics + Export/Import/Merge + Backup/Restore + Recovery/Diagnostics. Local-first; no cloud sync; **no prediction-engine changes**.
- **DB decision:** **DB-002 sufficient — NO DB-003.** Everything is derived/serialized from existing authoritative records (raw rounds + revisions = DB-001; locked_prediction_entries + session_state = DB-002). Only visibility change: `applyPaper` is now `export` in `live-session.ts` (behaviour unchanged).
- **Web policy (approved b):** Statistics/Export/Validate/Merge-preview/Diagnostics enabled on web preview (validate + preview ZERO writes); actual Merge/Restore **writes** are native-SQLite only (`WriteUnavailableError` → UI "Available on native SQLite runtime").
- **Files:** `src/domain/statistics/*`, `src/domain/backup/*`, `src/domain/diagnostics/*`, `src/data/backup/*`, `src/workflows/backup/*`, `src/app/(shell)/{statistics,export,diagnostics}.tsx`, `src/ui/stats/StatsView.tsx`, `src/ui/data/cards.tsx`.
- **Tests added:** `statistics` (9), `backup-export` (17), `backup-restore` (3). Gate: typecheck PASS, lint 0/0, **17 suites / 277 tests**, roadmap 26, engine 10, expo-doctor 18/18, package-lock + DB-001/DB-002 schema UNCHANGED.
- **Frontend validation:** web-preview interaction validation PASS at 1280x800 (Statistics empty+populated; Export summaries/counts; Validate PASS/FAIL; Merge report; Restore confirm; web write-gating disabled + labelled; Diagnostics read-only; regression Active Shoe/History/Live OK; zero console errors).
- **Remaining for final acceptance:** native SQLite/DB-002 transactional Merge/Restore verification on a physical Android build+restart (status A); optional native file save/share + document-picker import (MVP uses in-app JSON + paste).

## Status
- Milestone 5 (Live Workflow & Session Tracker) is **COMPLETE** (final acceptance audit accepted):
  - **M5A (domain core): COMPLETE.**
  - **M5B (domain hardening + persistence): COMPLETE.** Database is **DB-002 (current)**; DB-001 unchanged.
  - **M5C (live workflow/UI): COMPLETE.** Active Shoe wired to the persisted session
    (`use-live-session.ts` + `LiveSessionPanel.tsx`); Start Live / Start Historical Test;
    persisted LOCKED prediction; PLAYED/NOT_PLAYED; actual P/T/B routed to the store
    (lock-before-result gated; no history append in a forward session); engine/played
    progress + paper; **live-mode Review Data edit/delete via `SessionStore.editHistory`/
    `deleteHistory`** (invalidate + renumber + rebuild; raw-round views from the
    authoritative live session); **native fail-safe** `createSessionStore`
    (`SessionPersistenceUnavailableError`, no silent volatile downgrade); and a
    **live-only accidental double-tap guard** (`DuplicateInputGuard`, ~400ms re-arm) that
    never throttles History-Input bulk entry.
  - **Native persistence status: A. IMPLEMENTED_NOT_RUNTIME_VERIFIED** — recorded known
    limitation (needs a physical Android build + restart); NOT a code blocker.
  - **Milestone 6 (advanced statistics & export): COMPLETE** — final acceptance audit PASSED (release-candidate tag `m06-data-management-rc1`).
- Database schema version: **DB-002** (final audit added NO migration; DB-001 + DB-002 unchanged).
- **Persistence (`src/data/database/schema-db002.ts`, `src/data/repositories/
  locked-prediction-repository.ts`, `src/workflows/session/*`):** `session_state`
  (per-shoe workflow/cursor + paper cache) + `locked_prediction_entries` (immutable
  lock JSON payload + queryable lifecycle columns; partial-unique index enforces one
  valid lock per shoe+target). `SqliteSessionStore` (native, authoritative) and
  `MemorySessionStore` (web AsyncStorage fallback) share one `SessionStore` contract
  and contain NO business logic. Lock-before-result + transactional result submission
  are enforced; sequences + paper are DERIVED on reconstruct; a missing pending lock is
  deterministically regenerated during recovery.
- **Session engine (`src/domain/session/*`, pure, SESSION-001):** manual
  one-result-at-a-time workflow; `startSession` / `submitResult` / `editHistory` /
  `newShoe` / `serializeSession` / `reconstructSession` + canonical `lockPrediction`
  (deep-freeze). Locked predictions carry the ACTIVE trace + SHADOW audit; result
  evaluation → WIN/LOSS/PUSH/SKIPPED/INVALIDATED; engine-vs-played three-win tracker;
  revision invalidation preserves the audit trail; fixed-unit paper only.
- Prior milestones (M1–M4 + RELPRIOR-001) remain in force and unchanged.
- **NOT built:** any UI wiring of the session engine (M5C) and advanced statistics/
  export (M6). The M0 placeholders `evaluateStep` / `evaluateThreeWinSequence` /
  `categorizeConfidence` remain (superseded by the session/decision modules).

## Before you start
1. Read `AGENTS.md`, `docs/ENGINE_RULES.md`, `docs/ROADMAP_RULES.md`,
   `docs/CURRENT_STATE.md`, and this file.
2. From `/app/frontend`, run `npm ci` (then `sudo supervisorctl restart expo` if
   Metro was already running, so it rebuilds its graph against the fresh install).
3. Confirm the gate is green:
   `npm run typecheck && npm run lint && npm test && npm run test:roadmap && npm run test:engine && npx expo-doctor`.
   Expected: **17 suites / 277 tests**, roadmap 26, engine 10, doctor 18/18.

## Key building blocks (Milestone 4)
- Decision entrypoints: `decide(moduleResults, context, config?)` (fixed-vector)
  and `runDecisionPipeline(ctx)` (over an AnalysisContext) → `DecisionResult`.
- Pipeline files: `src/domain/decision/{config,types,families,data-quality,voting,confidence,risk,pipeline}.ts`.
- Weighted voting: independent Player/Banker scores, family correlation cap
  (discounted within-family sum), CONTEXT (regime) family ×0.5, conflict score.
- Confidence: evidence-depth based (`confidenceFromWinnerScore`), locked bands
  (`categoryFromConfidence`); agreement is a gate, not a probability.
- Risk filter: `computeRiskFlags` + `applyRiskFilter` (retain/downgrade/SKIP only).
- Tests: `src/tests/decision.test.ts` (18 deterministic fixed-vector cases).

## Key building blocks (Milestone 3)
- Pure helpers: `src/domain/analysis/helpers.ts` (runs, alternation, deepFreeze…).
- Snapshot: `buildShoeStateSnapshot(rounds, opts)`, `snapshotForTargetRound(rounds, N)`.
- Features: `extractFeatures(rounds, opts)` → `FeatureSet` (also `classifyRegime`).
- Analysis: `runAnalysis(ctx)` → `AnalysisReport` (`results` / `activeResults` /
  `shadowResults`). DISABLED modules are never computed; SHADOW_ONLY are computed
  but returned separately and must never influence a decision.
- Tests: `src/tests/analysis.test.ts` (28) + `src/tests/reliability.test.ts` (13,
  reliability-semantics regression).
- Reliability priors: `RELIABILITY_PRIORS` / `RELIABILITY_PRIOR_VERSION`
  (`RELPRIOR-001`) in `src/domain/analysis/types.ts`; `reliabilityPrior(id)`
  returns the fixed prior. UNCALIBRATED — do not treat as accuracy.

## Locked / do-not-touch (accepted M1 + M2 + M3 + M4)
- Roadmap engine (`src/domain/roadmap/engine.ts`) + `types.ts`.
- Engine thresholds (`src/config/engine.ts`), version registry
  (`src/config/versions.ts`), analyzer registry modes (`src/domain/analyzers/registry.ts`).
- Migration **DB-001** (`schema.ts` + `migrations.ts`) and the accepted repositories.
- Milestone 2 History domain, workflow, and UI (`src/domain/history/*`,
  `src/workflows/history/*`, `src/ui/history/*`, `src/ui/roadmap/*`).
- Milestone 3 snapshot/feature/analysis behavior, analyzer versions, module modes,
  and the `RELPRIOR-001` reliability priors.
- Milestone 4 Decision Pipeline behavior + `DECISION-001` config.
- Android package `com.bapp.baccaratengine`.

Any change to accepted behavior requires: a reproducible regression, a failing
regression test added first, the smallest possible fix, and all accepted tests
still passing.

## Do NOT
- Do NOT begin Milestone 7B (Android build / device QA / final acceptance) unless explicitly instructed.
- Do NOT implement the DB-002 migration or any persistence writes until DB-002 is
  approved. Do NOT alter the accepted **DB-001** migration (append a new migration only).
- Do NOT recompute a locked historical prediction (locks are immutable historical truth;
  reconstruct restores them verbatim and re-freezes them — never regenerate their contents).
- Activate the Historical Matcher or let SHADOW_ONLY modules (Volatility, Derived Road)
  influence the ACTIVE decision / side / confidence / category / BET-SKIP / sequence result.
- Modify engine thresholds or the Decision Pipeline config (DECISION-001/VOTE-001/
  CONF-001/RISK-001) silently; upgrade dependencies; add a backend; add Martingale /
  bet-sizing / progression (fixed-unit paper only).
- Introduce randomness, ML, network, balances, or target-sequence inputs.

## Next milestone scope (for the next agent)
**Immediate = Milestone 7B (Android test build + physical-device + native SQLite verification +
final release acceptance) — NOT STARTED; needs explicit authorization.**

**Milestone 7A is IMPLEMENTED and accepted** (final UI/UX + release QA + Android build readiness):
- Two former Milestone-0 placeholder routes are now REAL read-only screens — **History**
  (`src/app/(shell)/history.tsx`, read-only Shoe History / Raw Records browser over `useBappData`)
  and **Settings** (`src/app/(shell)/settings.tsx`, read-only Settings/About/System Info). No writes,
  no edit/delete, no config controls; editing/revisions stay in Active Shoe → Review Data.
- Restrained Active Shoe tablet-landscape polish (`index.tsx` + `src/ui/roadmap/RoadmapBoards.tsx`):
  better vertical distribution (Bead+Big grouped top, derived roads anchored bottom) + modestly larger
  roadmap cells. Roadmap algorithms/data, P/T/B order, large touch targets, the 400ms live-only guard,
  and unthrottled History Input are all UNCHANGED.
- Gate green: typecheck PASS, lint 0/0, **17 suites / 277 tests** (UI-only; no new tests), roadmap 26,
  engine 10, expo-doctor 18/18, package-lock + DB-001/DB-002 UNCHANGED, NO DB-003. Frontend testing
  agent: M7A interaction matrix ALL PASS at 1280×800.

**M7B device QA checklist (run on a physical Samsung Galaxy Tab S7 FE, landscape, from a real Android build):**
- **A. Basic persistence:** create shoe → enter rounds → create/persist a lock → kill app → reopen →
  verify the exact shoe/round/lock state restores from on-device SQLite/DB-002.
- **B. Revision:** edit a round → revision created → affected prediction INVALIDATED → restart →
  verify the revision + invalidation persist.
- **C. Backup/Restore:** representative data → Full Backup → Restore through native SQLite → restart →
  verify rounds/revisions/locks/invalidation, roadmap, engine sequence, played sequence, paper reconstruct.
- **D. Merge:** prepare an independent compatible dataset → Validate → Merge → restart → verify both
  datasets present, no orphan records, no duplicate valid locks.
- Only after this passes on a real device may `IMPLEMENTED_NOT_RUNTIME_VERIFIED` be upgraded and
  Milestone 7 be marked COMPLETE. Do NOT claim physical Android verification without real device evidence.

When doing M7B keep fixed-unit paper only (no Martingale/bet-sizing); do NOT alter DB-001/DB-002
migrations or the M1–M6 decision mathematics; keep the Historical Matcher DISABLED and Derived Road
+ Volatility SHADOW_ONLY.

## After your milestone
Update `docs/CURRENT_STATE.md`, this file, `docs/KNOWN_ISSUES.md`,
`docs/TEST_PLAN.md`, and `handoff/state.json`; keep the repo buildable and green.

## HMATCH-002 production promotion handoff
- Production defaults to the matcher-enabled BALANCED path; no operator mode selection is required.
- Old persisted STRICT preferences deterministically migrate to BALANCED. Existing locks are not rewritten.
- ENGINE-002 identifies the official-default promotion. HMATCH-002, MATCHFP-001, DECISION-003/004, BALCFG-001, VOTE-001, CONF-001, and RISK-001 semantics are unchanged.
- The dynamic `MatcherAudit -> matcherModuleAnalysis()` path remains the sole matcher voter. ABSTAIN remains a true no-vote.
- Settings/Statistics use production corpus truth; bundled data remains runtime-only and DB-002 remains unchanged.
