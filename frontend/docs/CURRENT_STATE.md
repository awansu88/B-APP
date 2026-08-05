# Current State

**Milestone:** 0 — Project Bootstrap. **Status: COMPLETE.**
**Milestone 1: NOT STARTED.**
**Date:** 2026-06 (bootstrap + compliance cleanup).
**App version:** 0.1.0 · **Engine:** ENGINE-001 · **Config:** CFG-001 · **DB schema:** 0

## Repository facts
- **Git repository root: `/app`.**
- The Git repository contains only the Expo mobile project (`frontend/`) plus
  platform meta (`.emergent/`, `memory/`, `test_reports/`, `tests/`, `README.md`).
- **`/app/backend` has been removed** from both Git and disk — no backend
  directory or backend file is tracked. The app has no backend, no cloud, no
  auth, and makes no network calls.

## What exists (accepted for Milestone 0)
- Clean Expo Router app (managed, strict TypeScript) under `frontend/`.
- **Landscape**, **dark**, tablet-first shell with a persistent left nav rail
  and six **navigable placeholder** routes: Active Shoe, History, Statistics,
  Export, Diagnostics, Settings.
- Android package `com.bapp.baccaratengine`; iOS bundle id matched;
  `android.permissions: []`.
- `src/` scaffolding: domain **types/enums**, **locked constants**, the
  **version registry**, **interfaces**, a **disabled/analyzer registry**, and
  **explicit non-runtime placeholders**.
- Diagnostics screen shows the locked version registry and analyzer modes
  (read-only view of constants).
- npm tooling with committed `package-lock.json`; Jest domain tests.

## What is explicitly NOT implemented / NOT accepted
No roadmap, prediction, confidence, analyzer, voting, or session **logic** is
implemented or accepted. Specifically:
- `reconstructBeadPlate` (roadmap) → explicit placeholder that throws.
- `categorizeConfidence` (confidence) → explicit placeholder that throws.
- `evaluateStep` / `evaluateThreeWinSequence` (sequence) → explicit
  placeholders that throw.
- Analyzers/voting/risk/snapshot/features/repositories → interfaces/constants
  only (no logic). Historical Matcher DISABLED; Volatility & Derived Road
  SHADOW_ONLY (registry data only).
- No screen or workflow imports or executes any placeholder logic. `workflows/`
  is empty.

## Verification (this milestone)
- `npm run typecheck` → pass (0 errors).
- `npm run lint` → pass (0 problems).
- `npm test` → 3 suites, 19 tests passing (smoke 6 / roadmap 3 / engine 10).
- `npm run test:roadmap` → 1 suite, 3 tests passing.
- `npm run test:engine` → 1 suite, 10 tests passing.
- `npx expo-doctor` → 18/18 checks passed.
- App boots in the preview; navigation across all six routes verified.

Tests intentionally validate ONLY: locked constants, enum/type behaviour, the
disabled/registry, and that future-milestone functions are unimplemented
placeholders. No test implies roadmap/analyzer/confidence/sequence logic is
validated.
