# Roadmap Rules (LOCKED)

**Roadmap version:** `ROADMAP-001`.
**Implementation:** `src/domain/roadmap/engine.ts` → `buildRoadmap(rounds)`
(pure; MUST NOT import React, React Native, Expo, SQLite, or UI components).

## Principle
Roadmaps are derived views, always **reconstructable purely from the ordered
raw `RoundRecord[]`** (Project Principle #2). They are never a source of truth
and are never stored as editable data. Editing any round and re-running
`buildRoadmap` yields a complete, deterministic rebuild.

## Output (`RoadmapResult`)
Bead Plate, Big Road logical cells, Big Eye Boy, Small Road, Cockroach Pig, tie
markers, player-pair markers, banker-pair markers, and the leading-tie count.

## Colour / marker model
- PLAYER = blue, BANKER = red, TIE = green (`RoadmapColor`; presentation only).
- Player Pair = small blue marker; Banker Pair = small red marker.
- Pair markers never change roadmap placement.
- Derived roads use a structural `DerivedMark` enum (`RED` / `BLUE`). Derived red
  is never stored as BANKER and derived blue is never stored as PLAYER.

## Bead Plate
Every round (including ties) is placed column-major on a fixed 6-row grid.
Consecutive ties remain in raw history and appear on the Bead Plate.

## Big Road
- Only PLAYER/BANKER results occupy the grid (6 rows).
- Same side moves down; when the column is full or blocked it **dragon-tails**
  to the right along the same row.
- A different side starts a new column.
- A Tie never creates a new Big Road column; it is recorded as a tie marker
  (with a running count) on the most recent PLAYER/BANKER cell.
- **Leading ties** (before the first PLAYER/BANKER) are never discarded — they
  are preserved on the Bead Plate and counted in `leadingTieCount`.

## Derived roads
Big Eye Boy (offset 1), Small Road (offset 2), Cockroach Pig (offset 3) are
generated from the Big Road's logical column heights via the standard
column-comparison algorithm, producing structural RED/BLUE marks.

## Determinism
`buildRoadmap` is a pure function of the ordered raw rounds: identical input
always yields identical output (covered by `src/tests/roadmap.test.ts`).

## Golden test coverage
`src/tests/roadmap.test.ts` asserts literal, independently hand-computed
fixtures for the Bead Plate, Big Road, tie/pair markers, leading-tie count, and
the three derived roads (coordinates + structural RED/BLUE marks), including
each derived road's first activation point, stable RED/BLUE runs, a colour
transition, dragon-tail interaction, and deterministic rebuild after editing a
middle round. Structural marks are a dedicated enum (`DerivedMark`): RED is
never BANKER and BLUE is never PLAYER.
