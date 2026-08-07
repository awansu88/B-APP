# Handoff

**From:** Milestone 4 (Decision Pipeline). **To:** Next agent (Milestone 5).
**Git repository root:** `/app`. **Expo app root:** `/app/frontend` (run all
commands from here). **Package manager:** npm (`package-lock.json`, unchanged).

## Status
- Milestone 4 (Decision Pipeline) is **complete**. **Milestone 5 has NOT started.**
- Database schema version: **DB-001** (unchanged). No persistence/locking added.
- **Decision Pipeline (`src/domain/decision/*`, pure, in-memory only):** Data
  Quality Gate → Weighted Voting → Family Correlation Cap → Conflict Detection →
  Confidence Engine → Risk Filter → Prediction **Draft**, with independent ACTIVE
  and SHADOW (volatility) records and a full decision trace. Entry points:
  `decide(moduleResults, context, config?)` (fixed-vector) and
  `runDecisionPipeline(ctx)` (over an AnalysisContext). Versions VOTE-001 /
  CONF-001 / RISK-001 and config DECISION-001.
- Weighted agreement is a consensus ratio (NOT a win probability). Confidence is
  evidence-depth based, gated by agreement ≥ 58% + ≥ 2 directional modules, clamped
  to 0.75. Risk Filter never reverses the side, raises a category, or increases
  confidence. Historical Matcher DISABLED; Volatility & Derived Road SHADOW_ONLY.
- **Milestone-3 reliability correction (`RELPRIOR-001`)** remains in force (analyzer
  `reliability` is an uncalibrated versioned prior; see `docs/ENGINE_RULES.md`).
- **NOT built (Milestone 5+):** prediction DB writes, prediction locking, result
  submission/evaluation, live workflow, and sequence/three-win tracking. The M0
  placeholders `categorizeConfidence` / `evaluateStep` / `evaluateThreeWinSequence`
  still throw (untouched).
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
   Expected: **8 suites / 138 tests**, roadmap 26, engine 10, doctor 18/18.

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
- Begin Milestone 5 unless explicitly instructed.
- Perform prediction database writes, **prediction locking**, result submission,
  result evaluation, live workflow, or sequence/three-win tracking.
- Activate the Historical Matcher or let SHADOW_ONLY modules influence the ACTIVE decision.
- Modify engine thresholds, DB-001, or the Decision Pipeline config silently;
  upgrade dependencies; add a backend.
- Introduce randomness, ML, network, balances, or target-sequence inputs.

## Next milestone scope (for the next agent)
**Milestone 5 = Prediction locking + evaluation.** Persist a locked prediction
BEFORE its result (Principle #5), submit/evaluate actual results, run the live
forward / historical-test workflow, and track the three-win sequence. This will
consume the Milestone-4 Prediction **Draft** and the decision trace. Implement the
still-placeholder `evaluateStep` / `evaluateThreeWinSequence` (and wire confidence
categorisation) as part of that milestone.

## After your milestone
Update `docs/CURRENT_STATE.md`, this file, `docs/KNOWN_ISSUES.md`,
`docs/TEST_PLAN.md`, and `handoff/state.json`; keep the repo buildable and green.
