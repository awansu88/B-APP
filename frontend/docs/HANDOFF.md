# Handoff

**From:** Milestone 1 (Local Data & Roadmap Engine). **To:** Next agent.
**Git repository root:** `/app`. **Expo app root:** `/app/frontend` (run all
commands from here). **Package manager:** npm (`package-lock.json`).

## Status
- Milestone 1 is **complete**. **Milestone 2 has NOT started.**
- Database schema version: **DB-001**.
- Accepted implementations: domain models/enums, the DB-001 SQLite layer
  (migrations + repositories over a UI-independent `SqlDatabase`), and the pure
  roadmap engine.
- **NOT accepted yet:** prediction/voting/confidence/risk/session logic and any
  screen beyond the Milestone 0 placeholders. Those functions remain explicit
  throwing placeholders.

## Before you start
1. Read `AGENTS.md` and every file in `docs/`.
2. From `/app/frontend`, run `npm ci`.
3. Confirm the gate is green:
   `npm run typecheck && npm run lint && npm test && npm run test:roadmap && npx expo-doctor`.

## Key building blocks
- Roadmap: `src/domain/roadmap/engine.ts` → `buildRoadmap(rounds)` (pure).
- Data: `src/data/database/*` (`SqlDatabase`, `schema.ts`, `migrations.ts`,
  `expo-sqlite-database.ts`) and `src/data/repositories/*`.
- Tests use an in-memory `SqlJsDatabase` (`src/tests/support/`) so repositories
  and migrations run in Jest without the native module.

## Locked / do-not-touch
- Engine thresholds (`src/config/engine.ts`) and version registry
  (`src/config/versions.ts`).
- Analyzer/module modes (`src/domain/analyzers/registry.ts`).
- The accepted DB-001 migration (`src/data/database/schema.ts` +
  `migrations.ts`) — never edit; append a new migration (DB-002, …).
- Android package `com.bapp.baccaratengine`.

## Do NOT
- Do not begin Milestone 2 unless explicitly instructed.
- Do not add a backend/cloud/auth/network call.
- Do not store roadmap cells as editable source data (rebuild from raw rounds).
- Do not upgrade dependencies without explicit permission.
- Do not leave broken partial UI integrations.

## After your milestone
Update `docs/CURRENT_STATE.md`, this file, `docs/KNOWN_ISSUES.md`, and
`handoff/state.json`; keep the repo buildable and all gates green.
