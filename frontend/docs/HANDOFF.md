# Handoff

**From:** Milestone 3 (Snapshots, Features, and Analysis Modules). **To:** Next agent.
**Git repository root:** `/app`. **Expo app root:** `/app/frontend` (run all
commands from here). **Package manager:** npm (`package-lock.json`, unchanged).

## Status
- Milestone 3 is **complete** (incl. the reliability-semantics correction
  `RELPRIOR-001`). **Milestone 4 has NOT started.**
- Database schema version: **DB-001** (unchanged).
- **Reliability correction:** analyzer `reliability` is now a deterministic,
  versioned **UNCALIBRATED MVP PRIOR** (`RELIABILITY_PRIORS` in
  `src/domain/analysis/types.ts`) and no longer encodes any current-shoe
  condition (non-Tie count, stability, volatility, streak, regime, distribution,
  shoe position, results, sequence state). Current-shoe evidence stays in
  `strength`; regime→context and volatility/stability→risk are deferred to
  Milestone 4; data quality stays in the Data Quality Guard. See
  `docs/ENGINE_RULES.md` → "Analyzer output semantics". Feature formulas, DB-001,
  roadmap engine, thresholds, and the History workflow/UI are all UNCHANGED.
- Accepted this milestone (pure domain engine, no UI/DB writes):
  - `src/domain/snapshot/shoe-snapshot.ts` — immutable `ShoeStateSnapshot`
    (`SNAPSHOT-001`) with future-leakage prevention.
  - `src/domain/features/feature-extraction.ts` — deterministic `FeatureSet`
    (`FEATURE-001`), windows + feature groups.
  - `src/domain/analysis/*` — shared module interface, 8 analyzers, disabled
    Historical Matcher, and a runner (analyzer version registry `ANALYZER_VERSIONS`).
- **NOT accepted / out of scope:** final voting, confidence scoring, risk
  decisions, prediction locking, activating the Historical Matcher, and letting
  SHADOW_ONLY analyzers (Volatility, Derived Road) influence a decision.

## Before you start
1. Read `AGENTS.md`, `docs/ENGINE_RULES.md`, `docs/ROADMAP_RULES.md`,
   `docs/CURRENT_STATE.md`, and this file.
2. From `/app/frontend`, run `npm ci` (then `sudo supervisorctl restart expo` if
   Metro was already running, so it rebuilds its graph against the fresh install).
3. Confirm the gate is green:
   `npm run typecheck && npm run lint && npm test && npm run test:roadmap && npm run test:engine && npx expo-doctor`.
   Expected: **7 suites / 120 tests**, roadmap 26, engine 10, doctor 18/18.

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

## Locked / do-not-touch (accepted M1 + M2 + M3)
- Roadmap engine (`src/domain/roadmap/engine.ts`) + `types.ts`.
- Engine thresholds (`src/config/engine.ts`), version registry
  (`src/config/versions.ts`), analyzer registry modes (`src/domain/analyzers/registry.ts`).
- Migration **DB-001** (`schema.ts` + `migrations.ts`) and the accepted repositories.
- Milestone 2 History domain, workflow, and UI (`src/domain/history/*`,
  `src/workflows/history/*`, `src/ui/history/*`, `src/ui/roadmap/*`).
- Milestone 3 snapshot/feature/analysis behavior, analyzer versions, module modes.
- Android package `com.bapp.baccaratengine`.

Any change to accepted behavior requires: a reproducible regression, a failing
regression test added first, the smallest possible fix, and all accepted tests
still passing.

## Do NOT
- Begin Milestone 4 unless explicitly instructed.
- Implement voting / confidence / risk decisions as a FINAL locked outcome.
- Perform prediction database writes, **prediction locking**, result submission,
  result evaluation, live workflow, or sequence/three-win tracking.
- Activate the Historical Matcher or let SHADOW_ONLY modules influence decisions.
- Modify engine thresholds or DB-001; upgrade dependencies; add a backend.
- Introduce randomness, ML, network, balances, or target-sequence inputs into analysis.

## Next milestone scope (for the next agent)
**Milestone 4 = Decision Pipeline ONLY** (no persistence, no locking): Data Quality
Gate, Weighted Voting, Family Correlation Cap, Conflict Detection, Confidence
Engine, Risk Filter, Active & Shadow Decision, and a Prediction **Draft** + decision
trace (in-memory only). Milestone 4 must NOT write prediction records, lock
predictions, submit/evaluate results, run a live workflow, or track sequences.
**Prediction LOCKING belongs to Milestone 5.**

## After your milestone
Update `docs/CURRENT_STATE.md`, this file, `docs/KNOWN_ISSUES.md`,
`docs/TEST_PLAN.md`, and `handoff/state.json`; keep the repo buildable and green.
