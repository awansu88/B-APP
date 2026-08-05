# Architecture (LOCKED)

## Overview
B-APP is a single Expo React Native app (managed workflow, strict TypeScript).
It is **local-first and fully offline**: there is no backend, no cloud database,
no authentication, and the app makes **no network calls** at runtime.

Prediction logic is **pure TypeScript** and lives entirely under `src/domain/`,
completely independent from React components (Project Principle #3). React only
consumes the domain via `src/workflows/` (empty in Milestone 0).

## Directory layout
```
src/
  app/              Expo Router routes (file-based). Uses `src/app` as the router root.
    (shell)/        Tablet landscape shell: left NavRail + <Slot/>.
  ui/               Presentational components + theme (dark, tablet-first).
  workflows/        Seam between pure domain code and React (empty in M0).
  domain/           PURE TypeScript. No React imports allowed here.
    models/         Outcome, PairStatus, RoundRecord (raw source of truth).
    roadmap/        Reconstruction of roadmaps from raw rounds (Bead Plate).
    snapshot/       Derived projections of a shoe (contract only in M0).
    features/       Derived numeric signals (contract only in M0).
    analyzers/      Analyzer registry + locked operating modes.
    voting/         Vote aggregation contract (M0 contract only).
    confidence/     Confidence categorisation (55/60/70/75 bands).
    risk/           Risk assessment contract (no Martingale in MVP).
    prediction/     Decisions, three-win sequence, LockedPrediction.
    session/        Session environments.
  data/
    database/       Local storage keys + schema version (no cloud).
    repositories/   Repository interfaces (contracts only in M0).
    migrations/     Immutable, accepted migrations.
  config/           Version registry + locked engine thresholds.
  export/           Exportable-entity contracts (on-device export).
  diagnostics/      Read-only snapshot of locked config/versions.
  tests/            Jest domain tests (smoke / roadmap / engine).
```

## Layering rules
- `domain/` may import only from `domain/` and `config/`. **No React, no Expo, no I/O.**
- `data/` may import from `domain/` and `config/`.
- `workflows/` orchestrates `domain/` + `data/` for the UI.
- `ui/` and `app/` may import from `workflows/`, `ui/`, `diagnostics/`, `config/`.
- Nothing in `domain/` imports from `ui/`, `app/`, or `data/`.

## Data flow
Raw `RoundRecord[]` (source of truth) → roadmap/feature/analyzer reconstruction
→ voting → confidence → locked prediction → (after result) sequence evaluation.
Everything downstream of raw rounds is **reconstructable** (Principle #2).

## Navigation
Expo Router with typed routes. A persistent left navigation rail
(`src/ui/NavRail.tsx`) renders six routes: Active Shoe, History, Statistics,
Export, Diagnostics, Settings. Landscape orientation is enforced via `app.json`.

## Persistence
On-device key/value storage via `@/src/utils/storage` (AsyncStorage / SecureStore
wrapper). Storage keys are declared in `src/data/database/index.ts`. No engine is
wired to storage yet in Milestone 0.

## Tooling
npm + `package-lock.json`. Jest (ts-jest, node env) for pure domain tests.
ESLint via `eslint-config-expo`. Strict TypeScript via `tsc --noEmit`.
