# Data Model (LOCKED)

## Version registry (`src/config/versions.ts`)
| Key             | Value        |
|-----------------|--------------|
| app             | `0.1.0`      |
| engine          | `ENGINE-001` |
| config          | `CFG-001`    |
| databaseSchema  | `0`          |
| roadmap         | `ROADMAP-001`|
| feature         | `FEATURE-001`|
| voting          | `VOTE-001`   |
| confidence      | `CONF-001`   |
| risk            | `RISK-001`   |

## Enumerations
- `Outcome` = `PLAYER | TIE | BANKER` — UI order `P / T / B`.
- `PairStatus` = `YES | NO | UNKNOWN`.
- `SessionEnvironment` = `HISTORY_INPUT | LIVE_FORWARD | HISTORICAL_TEST`.
- `PredictionDecision` = `BET_PLAYER | BET_BANKER | SKIP`.
- `ConfidenceCategory` = `BELOW_THRESHOLD | EXPERIMENTAL | QUALIFIED | HIGH_RECOMMENDATION`.
- `AnalyzerMode` = `ACTIVE | SHADOW_ONLY | EXPERIMENTAL_ONLY | DISABLED`.
- `StepEvaluation` = `WIN | LOSS | PUSH | SKIP`.

## Core entity — RoundRecord (source of truth)
`src/domain/models/round.ts`:
```ts
interface RoundRecord {
  id: string;         // stable unique id
  shoeId: string;     // owning shoe
  index: number;      // 0-based position within the shoe
  outcome: Outcome;   // PLAYER | TIE | BANKER
  playerPair: PairStatus;
  bankerPair: PairStatus;
  createdAt: string;  // ISO-8601
}
```
All other structures (roadmaps, snapshots, features, votes, predictions) are
derived from an ordered sequence of `RoundRecord`s.

## LockedPrediction
`src/domain/prediction/index.ts` — captured **before** the actual result is
known (Principle #5). Carries `engineVersion` and `configVersion`, which are
immutable for the batch (Principle #4).

## Persistence (`src/data/database/index.ts`)
- `DATABASE_SCHEMA_VERSION = 0`.
- Local key/value storage keys (`STORAGE_KEYS`): `shoes`, `rounds`,
  `predictions`, `configBatches`, `schemaVersion`. No cloud, no network.

## Migrations (`src/data/migrations/index.ts`)
- `MIGRATIONS = [{ version: 0, name: 'initial_baseline', accepted: true }]`.
- Accepted migrations are **immutable** — never edit; append new ones.

## Export (`src/export/index.ts`)
All important data is exportable on-device (Principle #9). `EXPORTABLE_ENTITIES`
= raw rounds, shoes, locked predictions, diagnostics snapshot. Formats: `JSON | CSV`.
