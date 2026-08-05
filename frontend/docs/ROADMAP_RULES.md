# Roadmap Rules (LOCKED)

**Roadmap version:** `ROADMAP-001` (`src/config/versions.ts` → `roadmap`).

## Principle
Roadmaps are **derived views**. They must always be **reconstructable purely
from the raw `RoundRecord[]`** (Project Principle #2). A roadmap is never a
source of truth and is never stored as authoritative data.

## Bead Plate (implemented in Milestone 0)
`src/domain/roadmap/beadPlate.ts`:
- Fixed height: **6 rows** (`BEAD_PLATE_ROWS = 6`).
- Layout is **column-major**: rounds fill top-to-bottom, then wrap to the next
  column.
- `reconstructBeadPlate(rounds)` sorts rounds by their intra-shoe `index`
  (defensive copy — pure, order-independent input) and maps each to a
  `BeadCell { row, col, outcome, playerPair, bankerPair, roundId }`.
- `countNonTie(rounds)` returns the number of non-Tie results.
- `isWarmedUp(rounds)` is `countNonTie(rounds) >= 8`.

## Derived roads
The Derived Road Analyzer (Big Eye Boy / Small Road / Cockroach Pig family) is
`SHADOW_ONLY` in the MVP — it may be computed and logged but must not influence a
recommendation. Its full reconstruction is deferred to a later milestone and,
when added, must remain a pure function of the raw rounds.

## Determinism
Roadmap reconstruction is a **pure function**: identical raw rounds always
produce an identical roadmap, independent of input ordering. This is covered by
`src/tests/roadmap.test.ts`.
