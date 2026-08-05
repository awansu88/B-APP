# MVP Specification (LOCKED)

**Product:** B-APP Baccarat Engine
**Platform:** Expo React Native (managed), strict TypeScript, Android-first.
**Target device:** Samsung Galaxy Tab S7 FE, **landscape** orientation.
**Package ID:** `com.bapp.baccaratengine`
**Runtime:** Local-first, fully offline. No backend, no cloud, no auth, no network calls.

## Purpose
Record raw baccarat rounds as the single source of truth, reconstruct roadmaps
from them, and (in later milestones) produce **locked** directional
recommendations with calibrated confidence — all on-device.

## Inputs
- Round outcome: **PLAYER**, **TIE**, **BANKER**.
- UI order for outcome entry is **P / T / B**.
- Optional **Player Pair** and **Banker Pair**, each with status **YES / NO / UNKNOWN**.
- Minimum warm-up: **8 non-Tie results** before any recommendation is allowed.

## Session environments
- `HISTORY_INPUT` — bulk entry of past shoes.
- `LIVE_FORWARD` — real-time round-by-round entry.
- `HISTORICAL_TEST` — replay of stored shoes against a locked config batch.

## Prediction decisions
- `BET_PLAYER`, `BET_BANKER`, `SKIP`.
- A prediction is **locked before** its actual result is submitted.

## Confidence categories (max uncalibrated 75%)
| Category            | Range     |
|---------------------|-----------|
| Experimental        | 55%–59%   |
| Qualified           | 60%–69%   |
| High Recommendation | 70%–75%   |
| (Below threshold)   | < 55%     |
Confidence is clamped to a maximum of **0.75**.

## Analysis modules (MVP)
| Module                          | Mode              |
|---------------------------------|-------------------|
| Streak Analyzer                 | ACTIVE            |
| Chop Analyzer                   | ACTIVE            |
| Run-Length Analyzer             | ACTIVE            |
| Distribution Analyzer           | ACTIVE            |
| Regime and Transition Analyzer  | ACTIVE            |
| Data Quality Guard              | ACTIVE            |
| Volatility Analyzer             | SHADOW_ONLY       |
| Derived Road Analyzer           | SHADOW_ONLY       |
| Historical Matcher              | DISABLED          |

## Tie evaluation
- A Tie is a **PUSH** for Player or Banker recommendations.
- A Tie does **not** advance or break a three-win sequence.

## Three-win target
- Three **consecutive valid recommendation wins**.
- Must occur **within the same shoe**.
- `SKIP` does not advance or break the sequence.
- `TIE` (PUSH) does not advance or break the sequence.
- A `LOSS` fails the current sequence.

## Deferred features (NOT in MVP)
Historical Matcher activation, machine learning, automatic self-learning, OCR,
provider scraping, cloud sync, login, server backend, Martingale execution,
automated replay, multi-device merge.

## Version registry
See `docs/DATA_MODEL.md` and `src/config/versions.ts`.
