# Handoff

**From:** Milestone 5A/5B (session domain core + hardening + DB-002 persistence).
**To:** Next agent (Milestone 5C live workflow/UI).
**Git repository root:** `/app`. **Expo app root:** `/app/frontend` (run all
commands from here). **Package manager:** npm (`package-lock.json`, unchanged).

## Status
- Milestone 5 (Live Workflow & Session Tracker) is **IN PROGRESS**:
  - **M5A (domain core): COMPLETE.**
  - **M5B (domain hardening + persistence): COMPLETE.** Domain hardening +
    **DB-002 persistence** are done. **Database is DB-002 (current)**; DB-001 is a
    historical accepted migration and is **unchanged**.
  - **M5C (live workflow/UI): NOT STARTED.**
  - **Milestone 6 (advanced statistics & export): NOT started.**
- Database schema version: **DB-002** (additive, forward-only migration registered
  through `schema_migrations`). DB-001 migration definition is untouched.
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
   Expected: **10 suites / 179 tests**, roadmap 26, engine 10, doctor 18/18.

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
- Do NOT begin Milestone 6 unless explicitly instructed.
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
**Immediate = M5C (live workflow / UI)** on top of the finished domain + DB-002
persistence. Wire the Active Shoe → Start Live / Start Historical Test flow; display
the locked recommendation + confidence/category + SKIP; submit an actual live result
(the store enforces lock-before-result + transactional persistence); show engine vs
played sequence progress and the PLAYED / NOT_PLAYED control; and reload/reconstruct
via `createSessionStore(...)` (native SQLite/DB-002, web AsyncStorage). Do NOT add
Martingale/bet-sizing; keep fixed-unit paper only.
**Then Milestone 6 = advanced statistics & export.**

## After your milestone
Update `docs/CURRENT_STATE.md`, this file, `docs/KNOWN_ISSUES.md`,
`docs/TEST_PLAN.md`, and `handoff/state.json`; keep the repo buildable and green.
