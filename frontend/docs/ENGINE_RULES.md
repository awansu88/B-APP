# Engine Rules (LOCKED)

> **Milestone 0 note:** this document is the LOCKED *specification* of engine
> behaviour. The functions referenced below (`categorizeConfidence`,
> `evaluateStep`, `evaluateThreeWinSequence`) are **explicit non-runtime
> placeholders** in Milestone 0 — they throw if executed and are **not** yet
> implemented or accepted. Only the enums and locked constants are live.

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
- Warm-up: at least **8 non-Tie** results before predictions — locked constant
  `MIN_WARMUP_NON_TIE = 8` (`src/config/engine.ts`). The warm-up *computation*
  is future-milestone work.

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

## Analyzer output semantics (LOCKED terminology)
Every analysis module returns `{ signal, strength, reliability, status,
reasonCodes, riskFlags, version }`. The four scoring concepts are strictly
separated so no layer double-counts current-shoe conditions:

| Term          | Meaning                                                                 | Layer |
|---------------|-------------------------------------------------------------------------|-------|
| **strength**  | Evidence strength of the *current* signal (may respond to current features). | Analyzer (now) |
| **reliability** | Versioned, **UNCALIBRATED MVP PRIOR** trust in the analyzer *itself*.  | Analyzer (now) |
| **context**   | Suitability of the current shoe/regime (a contextual multiplier).        | Milestone 4 |
| **risk**      | Current volatility, stability, uncertainty, and data quality.            | Milestone 4 (+ Data Quality Guard) |

`reliability` is an **UNCALIBRATED MVP PRIOR** — it is NOT observed accuracy, an
empirical win rate, or a calibrated statistic. It is a deterministic, versioned
constant per analyzer (`RELIABILITY_PRIORS` / `RELIABILITY_PRIOR_VERSION` in
`src/domain/analysis/types.ts`) and MUST NOT depend on any current-shoe
condition: non-Tie count, stabilityScore, volatilityScore, current streak,
current regime, current Player/Banker distribution, shoe position, financial
results, or sequence state. Current-shoe evidence belongs elsewhere:
- pattern evidence → `strength`;
- insufficient observations → activation requirement / ABSTAIN (reliability 0);
- regime suitability → Milestone-4 `context`;
- volatility & stability → Milestone-4 `risk` / `context`;
- data quality → the Data Quality Guard.

### Reliability priors (`RELPRIOR-001`, UNCALIBRATED)
Conservative, hand-picked MVP placeholders — **not** optimized against test data:

| Analyzer            | Prior | Mode        |
|---------------------|-------|-------------|
| streak              | 0.50  | ACTIVE      |
| chop                | 0.50  | ACTIVE      |
| run-length          | 0.45  | ACTIVE      |
| distribution        | 0.40  | ACTIVE      |
| regime-transition   | 0.45  | ACTIVE      |
| data-quality-guard  | 0.50  | ACTIVE (non-directional) |
| volatility          | 0.30  | SHADOW_ONLY |
| derived-road        | 0.30  | SHADOW_ONLY |
| historical-matcher  | 0.00  | DISABLED    |

Reliability is clamped to `[0, 1]`; an ABSTAINing module reports `reliability = 0`.
Changing a prior is a versioned engine decision (bump `RELIABILITY_PRIOR_VERSION`).

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
