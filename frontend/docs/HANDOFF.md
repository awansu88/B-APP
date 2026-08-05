# Handoff

**From:** Milestone 0 (Bootstrap, compliance-cleaned). **To:** Next agent.
**Git repository root:** `/app`. **Mobile project:** `/app/frontend`.
**Package manager:** npm (`package-lock.json`).

## Repository facts
- The repo tracks only the Expo mobile project plus platform meta. **There is no
  backend in the repository** (`/app/backend` was removed from Git and disk).
- Milestone 0 is **complete**. **Milestone 1 has NOT started.**
- **No roadmap, prediction, confidence, analyzer, voting, or session
  implementation is accepted yet** — only types, locked constants, the version
  registry, interfaces, a disabled/registry, and explicit non-runtime
  placeholders exist.

## Before you start
1. Read `AGENTS.md` and every file in `docs/`.
2. Run `npm ci` if dependencies are missing.
3. Confirm the gate is green:
   `npm run typecheck && npm run lint && npm test && npm run test:roadmap && npm run test:engine && npx expo-doctor`.

## Placeholders to implement in a later milestone (currently THROW)
- `src/domain/roadmap/beadPlate.ts` → `reconstructBeadPlate`.
- `src/domain/confidence/categories.ts` → `categorizeConfidence`.
- `src/domain/prediction/sequence.ts` → `evaluateStep`, `evaluateThreeWinSequence`.
Each throws `... not implemented in Milestone 0 ...` and is imported by nothing
except its own scaffolding test. Implement them (and only then add behaviour
tests) when the corresponding milestone is authorised.

## Locked / do-not-touch
- Engine thresholds (`src/config/engine.ts`) and version registry
  (`src/config/versions.ts`).
- Analyzer modes (`src/domain/analyzers/registry.ts`).
- Accepted migrations (`src/data/migrations/index.ts`).
- Android package `com.bapp.baccaratengine`.

## Do NOT
- Do not begin Milestone 1 unless explicitly instructed.
- Do not add a backend, cloud, auth, or any network call.
- Do not change the Android package, engine thresholds, or accepted migrations.
- Do not upgrade dependencies without explicit permission.
- Do not add behaviour tests that imply unfinished logic is validated.

## After your milestone
Update `docs/CURRENT_STATE.md`, this file, `docs/KNOWN_ISSUES.md`, and
`handoff/state.json`; keep the repo buildable and all gates green.
