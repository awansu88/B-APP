# PRD — B-APP Baccarat Engine

## Original problem statement
Build **Milestone 0 — B-APP Project Bootstrap** for an Android tablet
application ("B-APP Baccarat Engine"). Create a clean, offline, local-first Expo
React Native app (strict TypeScript, landscape, package `com.bapp.baccaratengine`,
target Samsung Galaxy Tab S7 FE), with a locked architecture, folder structure,
navigable placeholder routes, locked documentation, version registry, and a
passing test/lint/typecheck/expo-doctor gate. No backend, cloud, auth, or network.
Do not begin Milestone 1.

## Architecture
- Expo Router (managed), routes under `src/app` with a tablet landscape shell
  (left NavRail + `<Slot/>`), dark theme.
- Pure-TypeScript domain under `src/domain/**` (React-independent).
- npm + committed `package-lock.json`; Jest (ts-jest) for domain tests.
- Local-first: on-device storage contracts only; zero network calls.

## User persona
Single operator using an Android tablet at/after the table to record raw
baccarat rounds and (in later milestones) receive locked, calibrated betting
recommendations — fully offline.

## Core requirements (static / locked)
- Inputs P/T/B, optional Player/Banker pair (YES/NO/UNKNOWN), 8 non-Tie warm-up.
- Session environments: HISTORY_INPUT, LIVE_FORWARD, HISTORICAL_TEST.
- Decisions: BET_PLAYER, BET_BANKER, SKIP; prediction locked before result.
- Confidence bands 55–59 / 60–69 / 70–75, max 0.75.
- Analyzer modes locked; Historical Matcher DISABLED; Volatility & Derived Road SHADOW_ONLY.
- Tie is PUSH; three-win sequence rules (SKIP/TIE ignored, LOSS resets, same shoe).
- Raw rounds are the only source of truth; roadmaps reconstructable; all data exportable.

## Implemented (2026-06, Milestone 0)
- Full `src/` structure + version registry + locked thresholds.
- Domain models, Bead Plate reconstruction, confidence categorisation, three-win
  sequence, analyzer registry, diagnostics snapshot.
- Six navigable placeholder routes; Diagnostics shows locked versions/modes.
- Locked docs (AGENTS.md + docs/*.md) and `handoff/state.json`.
- Gate: typecheck ✅, lint ✅, jest 20/20 ✅ (roadmap 4, engine 10), expo-doctor 18/18 ✅.

## Backlog (deferred — do not start without instruction)
- P0 (Milestone 1+): round entry UI + local persistence wiring; roadmap rendering.
- P1: analyzers/voting/confidence engine implementation; locked config batches; export.
- P2: Historical Matcher, ML/self-learning, OCR, cloud sync, multi-device — all deferred per spec.

## Next tasks
Await explicit instruction to begin Milestone 1. Keep the repo buildable and all
gates green.
