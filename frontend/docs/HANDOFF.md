# Handoff

**From:** Milestone 2 (History Input Workflow & Roadmap UI). **To:** Next agent.
**Git repository root:** `/app`. **Expo app root:** `/app/frontend` (run all
commands from here). **Package manager:** npm (`package-lock.json`, unchanged).

## Status
- Milestone 2 is **complete**. **Milestone 3 has NOT started.**
- Database schema version: **DB-001** (unchanged — no new migration was required;
  edits use `UPDATE`, deletes/clears use a full renumbered `replaceShoe`, both
  within the existing schema).
- Accepted this milestone: the pure History domain, the additive repository
  methods, the `useHistorySession` workflow + `HistoryStore` persistence, and the
  Active Shoe History Input screen with roadmap rendering.
- **NOT accepted yet:** prediction / voting / confidence / risk / three-win
  sequence logic and the other route screens (still Milestone 0 placeholders).

## Before you start
1. Read `AGENTS.md` and every file in `docs/`.
2. From `/app/frontend`, run `npm ci`.
3. Confirm the gate is green:
   `npm run typecheck && npm run lint && npm test && npm run test:roadmap && npm run test:engine && npx expo-doctor`.
   Expected: **5 suites / 77 tests**, roadmap 26, engine 10, doctor 18/18.
   NOTE: `npm ci` reinstalls `node_modules`; if Metro was already running,
   **restart the `expo` service** afterwards (`sudo supervisorctl restart expo`)
   so Metro rebuilds its dependency graph against the fresh install.

## Key building blocks (Milestone 2)
- Pure logic: `src/domain/history/*` (`pair-mode`, `statistics`, `checkpoints`,
  `transaction-guard`, `session`). Fully unit-tested in `src/tests/history.test.ts`.
- Persistence: `src/workflows/history/history-store.ts` (interface +
  `SqliteHistoryStore` + `MemoryHistoryStore`) and the platform factory
  `create-store.ts` / `create-store.web.ts`.
- React seam: `src/workflows/history/use-history-session.ts` (`useHistorySession`).
- UI: `src/ui/history/*` and `src/ui/roadmap/RoadmapBoards.tsx`; screen at
  `src/app/(shell)/index.tsx`.

## Locked / do-not-touch
- The pure roadmap engine (`src/domain/roadmap/engine.ts`) and its tests.
- Engine thresholds (`src/config/engine.ts`), version registry
  (`src/config/versions.ts`), analyzer modes (`src/domain/analyzers/registry.ts`).
- The accepted **DB-001** migration (`schema.ts` + `migrations.ts`) — never edit;
  append DB-002+ if a schema change is ever required.
- Existing `RoundRepository.append` / `deleteFinal` (extend with NEW methods only).
- Android package `com.bapp.baccaratengine`.

## Do NOT
- Do not begin Milestone 3 unless explicitly instructed.
- Do not add a backend / cloud / auth / network call.
- Do not store roadmap cells as editable source data (rebuild from raw rounds).
- Do not upgrade dependencies or regenerate `package-lock.json`.
- Do not add prediction logic before it is authorised.

## After your milestone
Update `docs/CURRENT_STATE.md`, this file, `docs/KNOWN_ISSUES.md`, and
`handoff/state.json`; keep the repo buildable and all gates green.
