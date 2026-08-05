# Roadmap Rules (LOCKED)

> **Milestone 0 note:** this is the LOCKED *specification* of roadmap
> reconstruction. `reconstructBeadPlate` is an **explicit non-runtime
> placeholder** in Milestone 0 (it throws if executed) and is **not** yet
> implemented or accepted. Only `BEAD_PLATE_ROWS`, the `BeadCell` type, and the
> roadmap version constant are live.

**Roadmap version:** `ROADMAP-001` (`src/config/versions.ts` → `roadmap`).

## Principle
Roadmaps are **derived views**. They must always be **reconstructable purely
from the raw `RoundRecord[]`** (Project Principle #2). A roadmap is never a
source of truth and is never stored as authoritative data.

## Bead Plate (SPEC — placeholder in Milestone 0)
`src/domain/roadmap/beadPlate.ts`:
- Fixed height: **6 rows** (`BEAD_PLATE_ROWS = 6`) — live constant.
- `BeadCell { row, col, outcome, playerPair, bankerPair, roundId }` — live type.
- Layout will be **column-major**: rounds fill top-to-bottom, then wrap to the
  next column.
- `reconstructBeadPlate(rounds)` will sort rounds by their intra-shoe `index`
  and map each to a `BeadCell`. **In Milestone 0 this is an explicit placeholder
  that throws — no reconstruction logic exists yet.**
- Warm-up counting (≥ 8 non-Tie) is a future-milestone function; only the
  `MIN_WARMUP_NON_TIE = 8` constant (in `src/config/engine.ts`) is live.

## Derived roads
The Derived Road Analyzer (Big Eye Boy / Small Road / Cockroach Pig family) is
`SHADOW_ONLY` in the MVP — it may be computed and logged but must not influence a
recommendation. Its full reconstruction is deferred to a later milestone and,
when added, must remain a pure function of the raw rounds.

## Determinism (target for the future implementation)
When implemented, roadmap reconstruction must be a **pure function**: identical
raw rounds always produce an identical roadmap, independent of input ordering.
`src/tests/roadmap.test.ts` currently only checks the locked constant and that
the reconstruction function is an unimplemented placeholder.
