# Handoff

**From:** Milestone 0 (Bootstrap). **To:** Next agent.
**Repository root:** `/app/frontend`. **Package manager:** npm (`package-lock.json`).

## Before you start
1. Read `AGENTS.md` and every file in `docs/`.
2. Run `npm ci` if dependencies are missing.
3. Run the full gate and confirm green:
   `npm run typecheck && npm run lint && npm test && npm run test:roadmap && npm run test:engine && npx expo-doctor`.

## Ground truth
- Raw `RoundRecord[]` is the only source of truth (`src/domain/models/round.ts`).
- Roadmaps/snapshots/features/votes/predictions are reconstructable from raw
  rounds. Keep them pure and React-free (`src/domain/**`).
- Engine thresholds and analyzer modes are LOCKED (`src/config/engine.ts`,
  `src/domain/analyzers/registry.ts`). Do not change silently.
- Migrations are immutable once accepted (`src/data/migrations/index.ts`).

## What is ready to build on
- Version registry and locked config (`src/config/*`).
- Domain models, roadmap reconstruction, confidence bands, three-win sequence.
- Repository/analyzer/voting/risk **contracts** (interfaces) awaiting
  implementation in later milestones.
- `src/workflows/` is the intended seam to connect pure domain code to the UI.

## Do NOT
- Do not begin Milestone 1 unless explicitly instructed.
- Do not add a backend, cloud, auth, or any network call.
- Do not change the Android package, engine thresholds, or accepted migrations.
- Do not upgrade dependencies without explicit permission.

## After your milestone
Update `docs/CURRENT_STATE.md`, this file, `docs/KNOWN_ISSUES.md`, and
`handoff/state.json`; keep the repo buildable and all gates green.
