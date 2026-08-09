# AGENTS.md — Operating Rules for All Future Agents

**Project:** B-APP Baccarat Engine
**Repository root:** `/app/frontend`
**Status:** Milestone 6 (Statistics + Export/Import/Merge + Backup/Restore + Diagnostics) — **COMPLETE** (final acceptance audit PASSED; release-candidate tag `m06-data-management-rc1`). **Completed milestone: 6.** **Milestone 7 — M7A IMPLEMENTED (final UI/UX + regression QA + Android build readiness); READY FOR ANDROID BUILD / DEVICE QA. Milestone 7 is NOT COMPLETE — M7B (Android test build + physical-device + native SQLite restart/Merge/Restore verification + final release acceptance) is PENDING explicit authorization.** **Database: DB-002 current** (DB-001 + DB-002 migrations unchanged; NO DB-003). Known limitation (accepted): native SQLite/DB-002 transactional Merge/Restore = **IMPLEMENTED_NOT_RUNTIME_VERIFIED** (sql.js Jest + web-preview read-only; not run on a physical Android build+restart — do not claim physical Android verification). Do **not** begin M7B without authorization, and do **not** modify the DB-001/DB-002 migrations or M1–M6 semantics.

## M7.1 Patch 2 — DECISION-002 (BALANCED) + Derived Road ACTIVE + Profile Comparison (IMPLEMENTED)
**Versioned engine profiles.** `STRICT` (DECISION-001, ACCEPTED, **default**, Derived Road SHADOW_ONLY) and `BALANCED` (DECISION-002, EXPERIMENTAL, Derived Road **ACTIVE**). The ONLY behavioral difference is the analyzer-activation registry (`src/domain/decision/profiles.ts`): BALANCED swaps in `derivedRoadAnalyzerActive` (same directional math, reliability **0.30**, **STRUCTURE** family — only `status` flips to ACTIVE so it votes). **NO VOTE-001 change. NO confidence-threshold reduction. NO confidence-band change.** Both profiles keep Historical Matcher **NO-VOTE (DISABLED)** and Volatility **SHADOW_ONLY**. Both profiles are computed pre-result from the SAME snapshot; only the **selected** profile is the actionable lock, the other is immutable comparison telemetry stored in the versioned `LockedPrediction.profileComparison` (`PROFILECMP-001`) — **backward compatible** (pre-Patch-2 payloads omit it → `NOT_AVAILABLE`, never regenerated). Profile switching NEVER rewrites an already-locked target (only the next unlocked target uses the new profile). Selected profile threads via `usePreferences().engineMode` → `useLiveSession` → store opts → `computePrediction` (default STRICT preserves identity). **DB-002 unchanged, NO DB-003. package-lock/app.json UNCHANGED. NATIVE_BUILD_IMPACT = NONE.** Gate: typecheck PASS, lint 0/0, **21 suites / 343 tests** (305 baseline + 38 new: profiles 24, profile-stats 9, preferences 5), roadmap 26, engine 10, expo-doctor 18/18. **Section-15 honest result:** activating Derived Road measurably raises BALANCED confidence on some fixtures (e.g. "doubles" SKIP 0.50 → 0.54) but did NOT cross the unchanged BET threshold (no STRICT-SKIP→BALANCED-BET) and never flipped sides in valid fixtures. **Milestone 7 still NOT COMPLETE. Patch 3 (Historical Matcher voting) NOT STARTED. M7B pending.**


**A READ-ONLY explanatory layer only. DECISION-001 behavior is UNCHANGED** (no threshold lowered, no analyzer weight changed, no confidence/family-correlation/risk/LockedPrediction semantics changed). New code: `src/domain/observability/*` (pure classification/aggregation over the ALREADY-PRODUCED accepted trace — never recomputes prediction math), `src/workflows/preferences/*` (AsyncStorage-only UI toggles; NO engine config, NO DB schema), plus presentation in `src/ui/live/LiveSessionPanel.tsx`, `src/ui/stats/DecisionAvailabilityCard.tsx`, `src/ui/stats/StatsView.tsx`, and the `statistics`/`settings` screens. **Historical Matcher: data-collection/readiness is now VISIBLE (Completed Shoes / Non-Tie Rounds vs 100 / 5,000; COLLECTING or ELIGIBLE) but VOTING STAYS DISABLED in DECISION-001 even when ELIGIBLE.** **Derived Road / Volatility stay SHADOW_ONLY.** **BALANCED / DECISION-002: NOT IMPLEMENTED** (STRICT-only foundation; the Balanced chip is a disabled placeholder). **DB-002 unchanged — NO DB-003.** package-lock / app.json UNCHANGED. Gate: typecheck PASS, lint 0/0, **18 suites / 305 tests** (277 baseline + 28 new decision-observability), roadmap 26, engine 10, expo-doctor 18/18. **NATIVE_BUILD_IMPACT = NONE. Milestone 7 is still NOT COMPLETE; M7B still pending. Do NOT begin Patch 2 / DECISION-002 without authorization.**


This file is LOCKED guidance. Read it fully before touching anything.

## Milestone 6 status (COMPLETE — final acceptance audit PASSED)
Milestone 6 (**Statistics + Export/Import/Merge + Backup/Restore + Diagnostics**)
is **COMPLETE** and accepted (release-candidate tag `m06-data-management-rc1`).
Local-first, no cloud sync, **no prediction-engine changes**. **DB-002 is sufficient —
NO DB-003 was created.** The only visibility change to accepted code was making
`applyPaper` `export` in `src/domain/session/live-session.ts` (behaviour UNCHANGED)
so statistics reuse the accepted M5 fixed-paper rule; three-win reuses
`advanceSequence` (per-shoe reset — never crosses shoe boundaries). New code lives in
`src/domain/statistics/*`, `src/domain/backup/*`, `src/domain/diagnostics/*`,
`src/data/backup/*`, `src/workflows/backup/*`, and the `statistics`/`export`/`diagnostics`
screens. Web preview is READ-ONLY for destructive writes: Merge/Restore **apply** is
native-SQLite only (throws `WriteUnavailableError`, UI labels "Available on native SQLite
runtime"); Validate + Merge-preview are ZERO writes. Diagnostics are read-only (no
auto-repair). **Milestone 7 — M7A IMPLEMENTED (final UI/UX + regression QA + Android build readiness; see `docs/CURRENT_STATE.md`); M7B (Android build + physical-device + native SQLite restart/Merge/Restore verification + final release acceptance) NOT started — do not begin it without explicit authorization.**

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
