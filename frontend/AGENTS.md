# AGENTS.md — Operating Rules for All Future Agents

**Project:** B-APP Baccarat Engine
**Repository root:** `/app/frontend`
**Status:** Milestone 3 (Snapshots, Features & Analysis Modules) — COMPLETE. Do **not** begin Milestone 4 unless explicitly instructed.

This file is LOCKED guidance. Read it fully before touching anything.

## Read first, always
- Read **all** documentation in `docs/` and this file **before modifying any code**.
- Treat `docs/ENGINE_RULES.md`, `docs/ROADMAP_RULES.md`, and `docs/DATA_MODEL.md` as the source of truth for behaviour.
- After finishing any milestone, update `docs/CURRENT_STATE.md`, `docs/HANDOFF.md`, `docs/KNOWN_ISSUES.md`, and `handoff/state.json`.

## Hard rules (do NOT break)
- **Never recreate the project.** Extend the existing repository in place.
- **Never add a backend.** No FastAPI, no server, no cloud database, no authentication, no cloud storage.
- **Never make network calls** from the app. It is local-first and fully offline.
- **Never upgrade dependencies** without explicit permission.
- **Never change the Android package** (`com.bapp.baccaratengine`).
- **Never change engine thresholds silently** (see `src/config/engine.ts` and `docs/ENGINE_RULES.md`). Any change is a versioned, documented decision.
- **Never modify accepted database migrations** (`src/data/migrations/index.ts`). Append new ones instead.
- **Never implement future milestones** ahead of schedule.
- **Never leave partially integrated or broken features.** The repo must build after every milestone.

## Tooling
- This project uses **npm**. Commit `package-lock.json`.
- On an imported repository, run **`npm ci`**.
- Do **not** run `eas init`, `expo prebuild`, or any deploy command.
- Verification gate (must all pass before finishing a milestone):
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`
  - `npm run test:roadmap`
  - `npm run test:engine`
  - `npx expo-doctor`

## Locked principles (never violate)
1. Raw round records are the only source of truth.
2. Roadmaps must always be reconstructable from raw rounds.
3. Prediction logic must remain independent from React components.
4. Prediction configuration must be versioned and immutable during a test batch.
5. A prediction must be locked before its actual result is submitted.
6. No automatic global self-learning is allowed in the MVP.
7. Historical Matcher is DISABLED in the MVP.
8. Volatility Analyzer operates in SHADOW mode.
9. All important data must be exportable.
10. The repository must remain buildable after every milestone.
