# Current State

**Milestone:** 0 — Project Bootstrap. **Status: COMPLETE.**
**Date:** 2026-06 (bootstrap).
**App version:** 0.1.0 · **Engine:** ENGINE-001 · **Config:** CFG-001 · **DB schema:** 0

## What exists
- Clean Expo Router app (managed, strict TypeScript) rooted at `/app/frontend`.
- **Landscape**, **dark**, tablet-first shell with a persistent left navigation
  rail and six navigable placeholder routes: Active Shoe, History, Statistics,
  Export, Diagnostics, Settings.
- Android package `com.bapp.baccaratengine`; iOS bundle id matched.
- `android.permissions: []` (no extra permissions requested by the app).
- Full `src/` domain structure created (models, roadmap, snapshot, features,
  analyzers, voting, confidence, risk, prediction, session, data/*, config,
  export, diagnostics, workflows, ui, tests).
- **Pure-TypeScript** domain primitives (no React coupling):
  - Version registry + locked engine thresholds.
  - Outcome / PairStatus / RoundRecord models.
  - Bead Plate roadmap reconstruction + warm-up helpers.
  - Confidence categorisation (55/60/70/75, clamp 0.75).
  - Prediction decisions + three-win sequence evaluation (Tie = PUSH).
  - Analyzer registry with locked modes (ACTIVE / SHADOW_ONLY / DISABLED).
- Diagnostics screen renders the locked version registry and analyzer modes
  (read-only).
- npm tooling with committed `package-lock.json`; Jest domain tests.

## What is intentionally NOT implemented (per spec)
- No baccarat prediction logic wired into any route (placeholders only).
- No persistence engine wired to storage yet (contracts only).
- No backend, no cloud, no auth, no network calls.
- Historical Matcher DISABLED; Volatility & Derived Road SHADOW_ONLY.

## Verification (this milestone)
- `npm run typecheck` → pass (0 errors).
- `npm run lint` → pass (0 problems).
- `npm test` → 3 suites, 20 tests passing.
- `npm run test:roadmap` → 1 suite, 4 tests passing.
- `npm run test:engine` → 1 suite, 10 tests passing.
- `npx expo-doctor` → 18/18 checks passed.
- App boots in the preview; navigation across all six routes verified.

## Environment note
The hosting platform provides scaffolding directories (`/app/backend`,
`/app/tests`) that are **not part of the B-APP repository** (`/app/frontend`) and
are not used by the app. The app itself has no backend and makes no network
calls. See `docs/KNOWN_ISSUES.md`.
