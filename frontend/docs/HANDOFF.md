# Handoff

**From:** Milestone 6 FINAL ACCEPTANCE AUDIT (PASSED — M6 COMPLETE; release-candidate tag `m06-data-management-rc1`).
**To:** Next agent — Milestone 7 (final redesign/build & visual polish — NOT STARTED).
**Git repository root:** `/app`. **Expo app root:** `/app/frontend` (run all
commands from here). **Package manager:** npm (`package-lock.json`, unchanged).

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
- Do NOT begin Milestone 7 unless explicitly instructed.
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
**Immediate = Milestone 7 (final redesign/build & visual polish) — NOT STARTED.** Milestone 6
is COMPLETE and accepted (Statistics + Export/Import/Merge + Backup/Restore + Diagnostics; DB-002;
NO DB-003; release-candidate tag `m06-data-management-rc1`). The only outstanding item is
environmental, not a code gap: **native SQLite/DB-002 runtime verification** on a physical Android
build with an app restart (status A = `IMPLEMENTED_NOT_RUNTIME_VERIFIED`; the browser preview
uses the AsyncStorage `MemorySessionStore` only). When building Milestone 7 keep
fixed-unit paper only (no Martingale/bet-sizing); do NOT alter DB-001/DB-002 migrations
or the M1–M6 decision mathematics; keep the Historical Matcher DISABLED and Derived Road
+ Volatility SHADOW_ONLY.

## After your milestone
Update `docs/CURRENT_STATE.md`, this file, `docs/KNOWN_ISSUES.md`,
`docs/TEST_PLAN.md`, and `handoff/state.json`; keep the repo buildable and green.
