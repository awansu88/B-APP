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

## Decision Pipeline (Milestone 4, LOCKED — DECISION-001)
Pure, deterministic, in-memory only (NO persistence, NO prediction locking, NO
result submission/evaluation — those are Milestone 5+). Implemented in
`src/domain/decision/*`. Order:

Module Results → **Data Quality Gate** → **Weighted Voting** → **Family
Correlation Cap** → **Conflict Detection** → **Confidence Engine** → **Risk
Filter** → **Prediction Draft** (with independent ACTIVE and SHADOW records).

- **Module families:** Trend {streak, run-length, distribution}, Alternation
  {chop}, Context {regime-transition}, Structure {derived-road, SHADOW_ONLY},
  Risk {volatility, SHADOW_ONLY}, Historical {historical-matcher, DISABLED}.
- **Weighted voting:** Player and Banker support are computed **independently**
  from ACTIVE directional modules; vote weight = `strength × reliability`.
- **Family correlation cap:** correlated evidence within a family is capped via a
  discounted sum (`w0 + 0.5·w1 + 0.25·w2 …`). The CONTEXT (regime) family is
  multiplied by 0.5 — regime may **modify context** but must not blindly duplicate
  trend evidence.
- **Weighted agreement** = `max(P,B) / (P+B)`. It is a consensus ratio and is
  **NOT** a win probability. **Conflict** = `min(P,B) / (P+B)`.
- **Confidence Engine:** confidence is driven by evidence depth (winner score),
  gated by agreement ≥ **0.58** and ≥ **2** directional modules; clamped to
  **0.75**. Bands: Experimental 0.55–0.59, Qualified 0.60–0.69, High 0.70–0.75.
- **Data Quality Gate:** PASS (normal), LIMIT (confidence may be capped / category
  downgraded), BLOCK (final decision MUST be SKIP).
- **Risk Filter:** MAY retain, downgrade one category, or turn BET→SKIP. MAY NEVER
  reverse the side, raise a category, or increase confidence. Flags:
  LOW_MODULE_COUNT, SINGLE_FAMILY_SUPPORT, MODERATE_CONFLICT, STRONG_OPPOSITION,
  REGIME_TRANSITION, MEDIUM_DATA_QUALITY, RECENT_PATTERN_BREAK,
  LOW_SAMPLE_RELIABILITY, CONFIDENCE_NEAR_THRESHOLD.
- **Volatility SHADOW:** the ACTIVE record ignores volatility; a separate SHADOW
  record re-evaluates whether volatility would reduce confidence / downgrade /
  SKIP. Shadow is never the official recommendation.
- **Versions:** voting VOTE-001, confidence CONF-001, risk RISK-001, config
  DECISION-001 (plus engine ENGINE-001, config CFG-001).

The Milestone-0 placeholders `categorizeConfidence`, `evaluateStep`, and
`evaluateThreeWinSequence` remain unimplemented (they throw); the pipeline uses
its own `categoryFromConfidence`. Locking/evaluation are Milestone 5.

## ENGINE-002 — official Historical Matcher promotion
- The accepted/default production profile is the matcher-enabled BALANCED path.
- HMATCH-002 directional results enter the ordinary VOTE-001 family pipeline once as HISTORICAL evidence (reliability 0.30).
- HMATCH-002 ABSTAIN creates no ModuleAnalysis and changes no vote/support count.
- STRICT/DECISION-001 remains a legacy/control path and is not a normal operator mode.
- Existing locks retain their stored versions and are never recomputed. New production locks carry ENGINE-002.
- HMATCH-002, MATCHFP-001, matcher constants, confidence, risk, and roadmap semantics are unchanged.
