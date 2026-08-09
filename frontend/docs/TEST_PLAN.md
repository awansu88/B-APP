# Test Plan

## M7.1 Patch 1 — Decision Observability Foundation (IMPLEMENTED; checkpoint `m07-decision-expansion-wip1`)
**One new Jest suite** — `src/tests/decision-observability.test.ts` (**28** tests) over the pure observability
layer: Directional Lean sides + evidence share (and NONE/no-evidence guards); SKIP reason mapping + deterministic
precedence + NOT_AVAILABLE when trace missing; BET produces no SKIP reason; Decision Availability aggregate with
explicit denominators (eligible/bet/skip/betRate/skipRate/lean counts/skip-reason counts/traceUnavailable);
`topSkipReasons` ordering; Historical Matcher readiness (ELIGIBLE ⇔ shoes ≥ 100 AND nonTieRounds ≥ 5,000;
`votingEnabled` always false; readiness never activates voting); dataset adapters reading the verbatim stored
payload trace (missing ⇒ NOT_AVAILABLE, never regenerated). **DECISION-001 behavior is asserted UNCHANGED**
(observability never recomputes prediction math).
**Regression baseline preserved:** previous **277** tests all pass; total now **18 suites / 305 tests**. Gate
re-run: typecheck PASS, lint **0/0**, `npm test` **18/305**, `test:roadmap` **26**, `test:engine` **10**,
`expo-doctor` **18/18**, package-lock + app.json + DB-001/DB-002 schema UNCHANGED, **NO DB-003**.
**Targeted frontend validation (testing agent, 1280×800 landscape) — ALL PASS:**
- **Settings:** Display Preferences card — both switches (Show Directional Lean, Show Decision Details) toggle
  ON/OFF without crash; Engine Mode — STRICT active, BALANCED — Experimental disabled ("Not enabled in this
  patch"), no numeric engine-tuning knobs; Historical Matcher — Completed Shoes 0/100, Non-Tie Rounds 0/5,000,
  Eligibility COLLECTING, Voting DISABLED IN DECISION-001.
- **Active Shoe / Live:** P/T/B order + large targets unchanged; enter ~12 mixed rounds → Start Live; LOCKED
  decision = SKIP → Directional Lean (BANKER) appears labeled informational/non-actionable with "Why Skip"
  and the official decision still reads SKIP (no probability claim); Decision Details trace appears with the
  preference ON; 400ms live-only double-tap guard yields exactly ONE round; History Input remains unthrottled.
- **Statistics:** Decision Availability card — Eligible 2 / BET 0 / SKIP 2 / BET availability "0 / 2 (0.0%)" /
  SKIP rate 100.0% / lean 1/1/0; disclaimer "availability, not accuracy or a win probability"; Top SKIP Reasons
  + Historical Matcher (0/100, 12/5,000, COLLECTING, Voting DISABLED). Console clean apart from the expected
  AsyncStorage web-preview diagnostic. **NATIVE_BUILD_IMPACT = NONE. M7B device QA still pending.**



## Milestone 7A (Final UI/UX + Release QA + Android build readiness) — IMPLEMENTED
**No new Jest suites** — M7A adds two READ-ONLY screens (History, Settings) and a restrained Active
Shoe layout polish only; no accepted domain/engine behavior changed, so the regression baseline is
UNCHANGED at **17 suites / 277 tests**. Gate re-run after the UI changes: typecheck PASS, lint 0/0,
`npm test` 17/277, `test:roadmap` 26, `test:engine` 10, `expo-doctor` 18/18, package-lock + DB-001/
DB-002 schema UNCHANGED, NO DB-003.
**Frontend interaction matrix (testing agent, 1280×800 landscape) — ALL PASS:** History real read-only
(empty + populated shoe list w/ ACTIVE badge + rounds in ascending order; no edit/delete; Refresh);
Settings real read-only (Application / Data & Persistence DB-002 / Engine-System-Status; no config
controls); Active Shoe regression (P/T/B order + large targets; 5 roadmaps render; PP/BP + pair mode;
Start Live LOCKED panel + PLAYED/NOT_PLAYED; Review Data edit/delete); Statistics empty+populated;
Export Full/History/Analysis + Validate + Merge Preview + web write-gating; Diagnostics read-only.
Console clean (only the expected AsyncStorage web-preview diagnostic). **M7B device QA is pending
(see `docs/HANDOFF.md`); native SQLite = IMPLEMENTED_NOT_RUNTIME_VERIFIED.**

## Milestone 6 suites (Statistics / Export-Import-Merge / Backup-Restore)
**Milestone 6 status: COMPLETE** (final acceptance audit PASSED; tag `m06-data-management-rc1`). Next: Milestone 7 — NOT STARTED.
- `src/tests/statistics.test.ts` (**9**) — pure `computeFullStatistics` with literal expected
  values: empty data; winner counts across raw rounds; decision + WIN/LOSS/PUSH/SKIPPED
  classification with invalidated exclusion; confidence-category buckets (Experimental/Qualified/
  High); BET_PLAYER vs BET_BANKER; engine-vs-played (played filter + hypothetical vs actual paper);
  three-win completion; per-shoe reset (never crosses shoe boundary); chain-breaking-loss failed
  count; revision counts by action. Denominators asserted (WIN/(WIN+LOSS); PUSH/SKIPPED/INVALIDATED
  excluded).
- `src/tests/backup-export.test.ts` (**17**) — export FULL/HISTORY/ANALYSIS shape + metadata +
  counts; validate accepts well-formed FULL_BACKUP; rejects malformed / unsupported version /
  bad enum / orphan FK / duplicate valid lock; merge planning duplicate-skip / conflict / independent
  import / valid-lock collision; sql.js: validate causes ZERO DB writes, safe merge applies, unsafe
  plan rejected, failing apply rolls back (no partial dataset).
- `src/tests/backup-restore.test.ts` (**3**) — sql.js: full backup → empty DB → restore → compare
  authoritative records (shoes/rounds/revisions/locked-prediction audit + invalidation + verbatim
  payloads); roadmap + sequence + paper reconstruct identically after restore (no prediction
  regenerated); failing restore rolls back leaving prior data intact.

**Totals after Milestone 6:** 17 suites / **277 tests** (was 14 / 248; +3 suites / +29 tests).
All prior 248 remain green. `test:roadmap` 26, `test:engine` 10, `expo-doctor` 18/18, lint 0/0,
typecheck PASS, package-lock + DB-001/DB-002 schema unchanged.

## Tooling
- **Jest** with **ts-jest** (node environment) — pure TypeScript.
- Database tests run against an in-memory **sql.js** driver
  (`src/tests/support/sqljs-database.ts`) implementing the same `SqlDatabase`
  abstraction as the app's `expo-sqlite` adapter. sql.js is a devDependency and
  is imported only by test code.
- Every roadmap expected value is a **literal, independently hand-computed
  fixture** — no expected value is generated by calling `buildRoadmap` (except
  the explicit rebuild-determinism idempotency checks, which compare the engine
  to itself on purpose).

## Scripts
`npm run typecheck` · `npm run lint` · `npm test` · `npm run test:roadmap` ·
`npm run test:engine` · `npx expo-doctor`.

## Milestone 1 Suites (52 tests total)
### `src/tests/smoke.test.ts` (6)
Version registry (incl. `databaseSchema = DB-002`), thresholds, UI order P/T/B,
session environments, prediction decisions, diagnostics snapshot.

### `src/tests/engine.test.ts` (10)
Locked engine version/thresholds; enum values; analyzer registry modes;
confidence/sequence functions are explicit unimplemented placeholders (throw).

### `src/tests/roadmap.test.ts` (26)
- **16 core golden tests** — Bead Plate + Big Road coordinates, tie markers,
  pair markers, leading Tie, dragon tail, delete/correct/repeat rebuilds.
- **9 derived-road golden tests** — literal coordinate + structural-colour
  fixtures for: Big Eye Boy / Small Road / Cockroach Pig first activation
  points, a stable structural-RED run (with derived dragon tail), a stable
  structural-BLUE run, a structural colour transition across all three roads,
  big-road dragon-tail interaction (logical column height), deterministic
  rebuild after editing a middle round, and structural-enum integrity
  (RED ≠ BANKER, BLUE ≠ PLAYER).
- **1 source-of-truth test** — the full roadmap is rebuilt purely from raw
  rounds (out of order) with no stored roadmap JSON consulted.

### `src/tests/database.test.ts` (10)
DB-001 migration creation (all tables + ledger), idempotency, shoe
insert/retrieval, sequential rounds, duplicate-round rejection (UNIQUE),
transaction rollback, persistence abstraction, INSERT revision creation,
schema integrity (UNIQUE + required indexes), and foreign-key enforcement.

## Expected result (Milestone 1)
- typecheck: **pass** · lint: **pass**
- `npm test`: **4 suites, 52 tests passing**
- `test:roadmap`: **26 tests** · `test:engine`: **10 tests**
- expo-doctor: **18/18 checks pass**

## Milestone 2 additions (History Input)
### `src/tests/history.test.ts` (22 — pure History domain)
Result entry (add Player/Tie/Banker + INSERT revision), pair modes
(COMPLETE⇒NO / PARTIAL⇒UNKNOWN), automatic PP/BP draft reset, the double-tap /
busy `TransactionGuard`, undo, edit (+ UPDATE revision, id/roundNumber preserved),
delete (+ renumber 1..n), full roadmap rebuild after edit/delete, checkpoint
cadence (15/20/30 then +10; 25/35 excluded), and the 8-non-Tie warm-up gate
(ties never count).

### `src/tests/database.test.ts` (now 15 — +5)
Adds `RoundRepository.update` (edit + UPDATE revision), `replaceShoe` (renumbered
replace), `replaceShoe([])` (clear), **New-Shoe preservation** (archiving a shoe
keeps its rounds; a new shoe starts empty with a distinct id), and **round-id
stability** (edit/delete never recreate surviving round ids).

## Expected result (Milestone 2)
- typecheck: **pass** · lint: **pass**
- `npm test`: **5 suites, 79 tests passing**
  (smoke 6 · engine 10 · roadmap 26 · database 15 · history 22)
- `test:roadmap`: **26** · `test:engine`: **10** · expo-doctor: **18/18**
- `package-lock.json` unchanged; interaction-level UI validation 42/42 PASS.

## Milestone 3 additions (Snapshots, Features, Analysis Modules)
### `src/tests/analysis.test.ts` (28 — pure domain engine)
- **Snapshot immutability:** deep-frozen snapshot; mutation throws; `SNAPSHOT-001`.
- **Future-leakage prevention:** `snapshotForTargetRound(rounds, N)` equals a
  snapshot built from only rounds `< N`; future rounds never change a past target;
  a caller-supplied roadmap cannot leak future info.
- **Deterministic features:** identical rounds → identical features; fixed
  distribution/streak/regime values; `FEATURE-001`.
- **Tie handling:** ties excluded from non-Tie counts/streaks/warm-up; tieRatio.
- **Analyzer activation / insufficient data:** all non-guard modules ABSTAIN below
  the 8 non-Tie warm-up; Data Quality Guard always reports (never a side); locked
  module statuses and version-registry ids.
- **Fixed analyzer outputs:** streak-follow, distribution skew vs balanced, chop
  continuation, run-length continuation vs break, streaky-regime alignment.
- **Runner:** DISABLED (Historical Matcher) not computed; ACTIVE vs SHADOW
  separation; shadow modules never in `activeResults`.
- **Pipeline determinism:** same raw rounds + config + version → identical
  snapshot, features, and module results.

### `src/tests/reliability.test.ts` (13 — reliability-semantics correction)
Locks the corrected meaning of `reliability` (a deterministic, versioned
UNCALIBRATED MVP PRIOR per analyzer): the versioned prior registry
(`RELPRIOR-001`); every non-ABSTAIN result reports exactly its module prior;
reliability does **not** change when non-Tie count / stabilityScore /
volatilityScore change (once activated); `strength` still responds to the current
streak; modules still ABSTAIN below the warm-up (reliability 0); reliability stays
within `[0,1]`; identical inputs stay deterministic; Historical Matcher stays
DISABLED (never computed); Volatility & Derived Road stay SHADOW_ONLY; Data
Quality Guard stays non-directional with `strength` = data quality and
`reliability` = its fixed prior.

## Expected result (Milestone 3)
- typecheck: **pass** · lint: **pass**
- `npm test`: **7 suites, 120 tests passing**
  (smoke 6 · engine 10 · roadmap 26 · database 15 · history 22 · analysis 28 · reliability 13)
- `test:roadmap`: **26** · `test:engine`: **10** · expo-doctor: **18/18**
- `package-lock.json` unchanged; engine/DB-001/thresholds/version-registry unchanged.

## Milestone 4 additions (Decision Pipeline)
### `src/tests/decision.test.ts` (18 — deterministic fixed-vector tests)
Fixed vectors of module results + context fed to `decide(...)`:
Experimental Player, Experimental Banker, Qualified Player, Qualified Banker, High
recommendation, low-agreement SKIP (< 58%), strong-opposition SKIP (conflict ≥
40%), multiple-soft-risks SKIP (≥ 3 flags), data-quality BLOCK → SKIP, category
downgrade (HIGH → QUALIFIED on 2 soft risks, confidence capped to 0.69),
family-correlation cap (3 correlated Trend modules → 0.875, not 1.5),
active-vs-shadow volatility (shadow downgrades via RECENT_PATTERN_BREAK; active
unaffected), confidence ≤ 0.75, risk filter never reverses the winning side,
locked versions (VOTE-001/CONF-001/RISK-001/DECISION-001) + determinism, and an
end-to-end `runDecisionPipeline` integration on a real banker shoe.

## Milestone 5 additions (Live Workflow & Session Tracker)
### `src/tests/session.test.ts` (44 — deterministic)
**M5A core (24):** Evaluation (WIN / LOSS / PUSH / SKIPPED / INVALIDATED); three-win
tracker (3-win completion, loss-after-two reset, SKIP/PUSH no-op, profile filtering);
Start Live and Start Historical Test (source tagging, ≥8 non-Tie gate); prediction
lock immutability (deep-frozen; mutation throws); result submission WIN/LOSS/PUSH;
engine-vs-played sequence separation; duplicate/out-of-order rejection with atomic
(unchanged) state; disabled input rejection; New-Shoe reset; history-revision
invalidation (audit trail preserved, fresh lock); and application-restart
reconstruction (sequences + current lock rebuilt from persisted state).

**M5B hardening (+20):** BET_PLAYER + BET_BANKER WIN/LOSS on synthetic locks
(engine-independent, so both directional paths are covered without an all-Banker
dependency); Tie→PUSH and SKIP→SKIPPED leave the sequence unchanged; exact literals
**WIN·PUSH·WIN·SKIP·WIN → complete** and **WIN·PUSH·LOSS → reset**; engine-vs-played
independence + shoe-boundary reset; future-leakage / lock-before-result (a locked
prediction for target N is identical regardless of N's actual result, and round N is
never in its own snapshot); reconstructed locks remain **deeply frozen** (canonical
`lockPrediction`/`deepFreeze` shared by create + reconstruct); restart reconstruction
A–G (persist→JSON→reconstruct: identical lock; evaluation/sequences/paper; interleaved
neutrals still complete; PLAYED/NOT_PLAYED + revision invalidation survive; no duplicate
target-round lock); and a shadow-isolation regression (a SHADOW-only volatility input
never mutates the ACTIVE lock).

### `src/tests/session-persistence.test.ts` (18 — DB-backed, sql.js)
DB-002 migration (fresh DB-001+DB-002; upgrade on top of an existing DB-001 database
preserving shoes/rounds/revisions; idempotent; FK enforcement; rollback leaves no
half-migrated schema); DB-enforced duplicate-lock rejection (partial-unique
`WHERE invalidated = 0`); lock-before-result failure (lock persist fails → nothing
accepted; result persist fails → pending lock untouched); transactional recovery of a
missing pending lock; revision linkage (invalidated + `invalidated_by_revision_id` +
coexisting old/new locks for one target); **native delete-history** (renumber rounds
1..n, invalidate affected locks, recover one valid lock, INVALIDATED survives restart);
restart reconstruction A–G; and `MemorySessionStore` web-fallback parity.

### `src/tests/session-workflow.test.ts` (22 — store/workflow integration, MemorySessionStore)
A–O: lock-before-result eligibility + persist-failure rejection; both directional
evaluations; Tie→PUSH and SKIP→SKIPPED sequence-neutral; PLAYED vs NOT_PLAYED engine/
played advance; reload-between-steps completion; LOSS reset; reload keeps the same lock
(no duplicate target); revision invalidation immutability; New-Shoe boundary.
**M5C continuation (P–J):** edit before a locked target → revision + INVALIDATED +
immutable payload; delete → renumber/rebuild + recovered valid lock; engine and played
sequences reconstruct **from valid entries only** after a revision; revision survives
persistence/reconstruction; no duplicate valid lock after edit; **TransactionGuard**
rejects a concurrent rapid duplicate; PARTIAL⇒UNKNOWN and COMPLETE⇒NO pair persistence
on a live round; and PP/BP auto-reset (mode sticky).

### `src/tests/session-factory.test.ts` (3 — platform factory fail-safe)
Web factory returns the AsyncStorage-compatible memory adapter (`kind=memory`); native
factory success returns the durable SQLite adapter (`kind=sqlite`); native SQLite init
failure throws `SessionPersistenceUnavailableError` and **never** returns a volatile
memory store for a live persisted session.

### `src/tests/input-safety.test.ts` (6 — accidental double-tap guard, Section 12)
`DuplicateInputGuard` with an injected clock: first tap accepted immediately; an
accidental rapid second tap and a rapid burst are rejected (exactly one accept);
a deliberate tap after the ~400ms re-arm window is accepted; `reset()` re-arms; and
seconds-apart manual entry is never blocked.

## Expected result (Milestone 5)
- typecheck: **pass** · lint: **pass (0 errors / 0 warnings)**
- `npm test`: **14 suites, 248 tests passing**
  (smoke 6 · engine 10 · roadmap 26 · database 15 · history 22 · analysis 28 ·
  reliability 13 · decision 18 · decision-audit 17 · session 44 · session-persistence 18 ·
  session-workflow 22 · session-factory 3 · input-safety 6)
- `test:roadmap`: **26** · `test:engine`: **10** · expo-doctor: **18/18**
- `package-lock.json` unchanged; **DB-001 + DB-002 schema unchanged** (final audit added no
  migration); thresholds/version-registry/analyzer modes/reliability priors/decision
  pipeline/snapshot+feature unchanged. The final acceptance audit added only the
  live-only `DuplicateInputGuard` input-safety utility + its wiring + tests.
- **M5 final-acceptance interaction validation (web preview / MemorySessionStore, 1280×800):**
  Start Live → LOCKED target + decision/confidence/category; PLAYED/NOT_PLAYED; actual
  P/T/B evaluation; Tie→PUSH (on a BET decision); engine/played progress + paper; reload
  restores the exact pending target; Review Data edit + delete during live rebuild
  roadmaps/stats; New Shoe fully resets; live accidental double-tap + 4-tap burst each add
  exactly ONE round while History-Input bulk entry (~200ms) registers 12/12; zero console
  errors/rejections/key warnings (expected AsyncStorage web diagnostic only). Native SQLite
  runtime NOT verified from a browser (status A).

## Expected result (Milestone 4)
- typecheck: **pass** · lint: **pass**
- `npm test`: **9 suites, 155 tests passing**
  (smoke 6 · engine 10 · roadmap 26 · database 15 · history 22 · analysis 28 ·
  reliability 13 · decision 18 · decision-audit 17)
- `test:roadmap`: **26** · `test:engine`: **10** · expo-doctor: **18/18**
- `package-lock.json` unchanged; engine/DB-001/thresholds/version-registry/analyzer
  modes/reliability priors/History workflow & UI unchanged.

### `src/tests/decision-audit.test.ts` (17 — final acceptance audit)
Permutation invariance of the family cap (all 24 permutations of a Trend+Alternation
vector yield identical scores/agreement/conflict/confidence/category/side/decision;
ties order-independent), ACTIVE/SHADOW isolation (SHADOW_ONLY + DISABLED never vote;
volatility only affects the shadow record), DQG-vs-Risk ownership (PASS/LIMIT/BLOCK;
LIMIT caps once with no second downgrade), literal confidence boundaries
(0.5499/0.55/0.5999/0.60/0.6999/0.70/0.75 + clamp), risk invariants (never flips
side / raises category / raises confidence; ≤ 1-step downgrade; strong-opposition
→ SKIP), and four hand-calculated golden vectors (PLAYER, BANKER, family-cap,
conflict/SKIP) whose expected values are written literally.
