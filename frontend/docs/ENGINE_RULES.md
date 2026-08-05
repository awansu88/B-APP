# Engine Rules (LOCKED)

These rules are frozen. Any change is a **versioned engine decision** and must be
documented and reflected in `src/config/versions.ts` (bump `ENGINE-###`). Never
change a threshold silently.

## Source constants
Defined in `src/config/engine.ts`:
- `MIN_WARMUP_NON_TIE = 8`
- `MAX_UNCALIBRATED_CONFIDENCE = 0.75`
- `THREE_WIN_TARGET = 3`
- `CONFIDENCE_BANDS`:
  - Experimental: `[0.55, 0.60)`
  - Qualified: `[0.60, 0.70)`
  - High Recommendation: `[0.70, 0.75]`

## Inputs
- Outcomes: `PLAYER`, `TIE`, `BANKER` (`src/domain/models/outcome.ts`).
- UI entry order: **P / T / B** (`UI_OUTCOME_ORDER`).
- Pairs: Player Pair / Banker Pair each `YES | NO | UNKNOWN`
  (`src/domain/models/pair.ts`).
- Warm-up: at least **8 non-Tie** results before predictions
  (`isWarmedUp` in `src/domain/roadmap/beadPlate.ts`).

## Prediction decisions
`BET_PLAYER | BET_BANKER | SKIP` (`src/domain/prediction/decision.ts`).
A prediction must be **locked before** the actual result is submitted
(`LockedPrediction` in `src/domain/prediction/index.ts`).

## Confidence categorisation
`categorizeConfidence(confidence)` (`src/domain/confidence/categories.ts`):
- clamps input to `[0, 0.75]`;
- `< 0.55` → `BELOW_THRESHOLD` (never recommended);
- `[0.55, 0.60)` → `EXPERIMENTAL`;
- `[0.60, 0.70)` → `QUALIFIED`;
- `[0.70, 0.75]` → `HIGH_RECOMMENDATION`.

## Analyzer modes (LOCKED)
`src/domain/analyzers/registry.ts`:
- ACTIVE: Streak, Chop, Run-Length, Distribution, Regime-and-Transition, Data Quality Guard.
- SHADOW_ONLY: Volatility Analyzer, Derived Road Analyzer.
- DISABLED: Historical Matcher.

SHADOW_ONLY analyzers are computed/logged but must **never** influence a decision.
DISABLED analyzers are not computed at all in the MVP.

## Tie evaluation
`evaluateStep(decision, outcome)` (`src/domain/prediction/sequence.ts`):
- `SKIP` decision → `SKIP` step.
- Tie on a Player/Banker recommendation → `PUSH`.
- Otherwise → `WIN` if the recommended side matches, else `LOSS`.

## Three-win sequence
`evaluateThreeWinSequence(steps)`:
- `WIN` advances the streak; three consecutive wins → **achieved**.
- `LOSS` fails (resets) the current streak.
- `SKIP` and `PUSH` (Tie) neither advance nor break the streak.
- The target must be achieved **within the same shoe** (the caller must pass
  single-shoe steps).

## No self-learning
No automatic global self-learning in the MVP (Principle #6). Configuration is
immutable during a test batch (Principle #4).
