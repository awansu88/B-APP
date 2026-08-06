import { memo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type {
  BeadPlateCell,
  BigRoadCell,
  DerivedCell,
  RoadmapResult,
} from '@/src/domain/roadmap/types';
import { DerivedMark, RoadmapColor } from '@/src/domain/roadmap/types';
import { Winner } from '@/src/domain/models/outcome';
import { colors, radius, spacing } from '../theme';

const ROWS = 6;
const BEAD = 26;
const BIG = 24;
const DERIVED = 15;

const hexForColor = (c: RoadmapColor): string => {
  switch (c) {
    case RoadmapColor.BLUE:
      return colors.player;
    case RoadmapColor.RED:
      return colors.banker;
    default:
      return colors.tie;
  }
};

const letterForWinner = (w: Winner): string => {
  switch (w) {
    case Winner.PLAYER:
      return 'P';
    case Winner.BANKER:
      return 'B';
    default:
      return 'T';
  }
};

function columnCount(cells: readonly { col: number }[]): number {
  let max = 0;
  for (const cell of cells) if (cell.col > max) max = cell.col;
  return max + 1;
}

/** A fixed-height board frame with a title. */
function Board({
  title,
  width,
  height,
  children,
  testID,
}: {
  title: string;
  width: number;
  height: number;
  children: React.ReactNode;
  testID?: string;
}) {
  return (
    <View style={styles.board} testID={testID}>
      <Text style={styles.boardTitle}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.boardScroll}
      >
        <View style={{ width: Math.max(width, 1), height }}>{children}</View>
      </ScrollView>
    </View>
  );
}

const PairDots = ({ pp, bp, size }: { pp: boolean; bp: boolean; size: number }) => (
  <>
    {pp ? (
      <View
        style={[
          styles.pairDot,
          { backgroundColor: colors.player, top: 1, left: 1, width: size, height: size, borderRadius: size / 2 },
        ]}
      />
    ) : null}
    {bp ? (
      <View
        style={[
          styles.pairDot,
          { backgroundColor: colors.banker, bottom: 1, right: 1, width: size, height: size, borderRadius: size / 2 },
        ]}
      />
    ) : null}
  </>
);

const BeadPlateBoard = memo(({ cells }: { cells: readonly BeadPlateCell[] }) => {
  const cols = columnCount(cells);
  const map = new Map<string, BeadPlateCell>();
  for (const c of cells) map.set(`${c.row},${c.col}`, c);
  return (
    <Board title="Bead Plate" width={cols * BEAD} height={ROWS * BEAD} testID="board-bead-plate">
      {Array.from({ length: ROWS }).map((_, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {Array.from({ length: cols }).map((__, col) => {
            const cell = map.get(`${row},${col}`);
            return (
              <View key={col} style={[styles.gridCell, { width: BEAD, height: BEAD }]}>
                {cell ? (
                  <View
                    style={[
                      styles.bead,
                      { backgroundColor: hexForColor(cell.color) },
                    ]}
                  >
                    <Text style={styles.beadText}>{letterForWinner(cell.winner)}</Text>
                    <PairDots pp={cell.playerPair} bp={cell.bankerPair} size={7} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </Board>
  );
});
BeadPlateBoard.displayName = 'BeadPlateBoard';

const BigRoadBoard = memo(({ cells }: { cells: readonly BigRoadCell[] }) => {
  const cols = columnCount(cells);
  const map = new Map<string, BigRoadCell>();
  for (const c of cells) map.set(`${c.row},${c.col}`, c);
  return (
    <Board title="Big Road" width={cols * BIG} height={ROWS * BIG} testID="board-big-road">
      {Array.from({ length: ROWS }).map((_, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {Array.from({ length: cols }).map((__, col) => {
            const cell = map.get(`${row},${col}`);
            return (
              <View key={col} style={[styles.gridCell, { width: BIG, height: BIG }]}>
                {cell ? (
                  <View
                    style={[
                      styles.bigCircle,
                      { borderColor: hexForColor(cell.color), width: BIG - 6, height: BIG - 6, borderRadius: (BIG - 6) / 2 },
                    ]}
                  >
                    {cell.ties > 0 ? (
                      <Text style={[styles.tieCount, { color: colors.tie }]}>{cell.ties}</Text>
                    ) : null}
                    <PairDots pp={cell.playerPair} bp={cell.bankerPair} size={6} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </Board>
  );
});
BigRoadBoard.displayName = 'BigRoadBoard';

const DerivedBoard = memo(
  ({ title, cells, testID }: { title: string; cells: readonly DerivedCell[]; testID: string }) => {
    const cols = Math.max(columnCount(cells), 3);
    const map = new Map<string, DerivedCell>();
    for (const c of cells) map.set(`${c.row},${c.col}`, c);
    return (
      <Board title={title} width={cols * DERIVED} height={ROWS * DERIVED} testID={testID}>
        {Array.from({ length: ROWS }).map((_, row) => (
          <View key={row} style={{ flexDirection: 'row' }}>
            {Array.from({ length: cols }).map((__, col) => {
              const cell = map.get(`${row},${col}`);
              const color = cell
                ? cell.mark === DerivedMark.RED
                  ? colors.banker
                  : colors.player
                : 'transparent';
              return (
                <View key={col} style={[styles.gridCell, { width: DERIVED, height: DERIVED }]}>
                  {cell ? (
                    <View
                      style={{
                        width: DERIVED - 5,
                        height: DERIVED - 5,
                        borderRadius: (DERIVED - 5) / 2,
                        backgroundColor: color,
                      }}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}
      </Board>
    );
  },
);
DerivedBoard.displayName = 'DerivedBoard';

export const RoadmapBoards = memo(({ roadmap }: { roadmap: RoadmapResult }) => {
  return (
    <View style={styles.container} testID="roadmap-boards">
      <BeadPlateBoard cells={roadmap.beadPlate} />
      <BigRoadBoard cells={roadmap.bigRoad} />
      <View style={styles.derivedRow}>
        <DerivedBoard title="Big Eye Boy" cells={roadmap.bigEyeBoy} testID="board-big-eye-boy" />
        <DerivedBoard title="Small Road" cells={roadmap.smallRoad} testID="board-small-road" />
        <DerivedBoard title="Cockroach Pig" cells={roadmap.cockroachPig} testID="board-cockroach-pig" />
      </View>
      {roadmap.leadingTieCount > 0 ? (
        <Text style={styles.leadingTie}>Leading ties: {roadmap.leadingTieCount}</Text>
      ) : null}
    </View>
  );
});
RoadmapBoards.displayName = 'RoadmapBoards';

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  derivedRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  board: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.sm,
    flexShrink: 1,
  },
  boardTitle: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  boardScroll: { flexGrow: 0 },
  gridCell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#1E2731',
  },
  bead: {
    width: BEAD - 6,
    height: BEAD - 6,
    borderRadius: (BEAD - 6) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  beadText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  bigCircle: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  tieCount: { fontSize: 9, fontWeight: '800' },
  pairDot: { position: 'absolute' },
  leadingTie: { color: colors.textMuted, fontSize: 11, fontStyle: 'italic' },
});
