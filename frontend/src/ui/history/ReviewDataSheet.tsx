import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { RoundEdit } from '@/src/domain/history';
import { Winner } from '@/src/domain/models/outcome';
import { PairState } from '@/src/domain/models/pair';
import type { RoundRecord } from '@/src/domain/models/round';
import { colors, radius, spacing } from '../theme';

interface ReviewDataSheetProps {
  readonly visible: boolean;
  readonly rounds: readonly RoundRecord[];
  readonly onClose: () => void;
  readonly onEdit: (roundNumber: number, edit: RoundEdit) => void;
  readonly onDelete: (roundNumber: number) => void;
}

const winnerLabel: Record<Winner, string> = {
  [Winner.PLAYER]: 'Player',
  [Winner.TIE]: 'Tie',
  [Winner.BANKER]: 'Banker',
};
const winnerColor: Record<Winner, string> = {
  [Winner.PLAYER]: colors.player,
  [Winner.TIE]: colors.tie,
  [Winner.BANKER]: colors.banker,
};

const WINNERS: readonly Winner[] = [Winner.PLAYER, Winner.TIE, Winner.BANKER];
const PAIR_STATES: readonly PairState[] = [PairState.YES, PairState.NO, PairState.UNKNOWN];

function Segmented<T extends string>({
  options,
  value,
  labelFor,
  onChange,
  testIDPrefix,
}: {
  options: readonly T[];
  value: T;
  labelFor: (v: T) => string;
  onChange: (v: T) => void;
  testIDPrefix: string;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            testID={`${testIDPrefix}-${opt}`}
            onPress={() => onChange(opt)}
            style={[styles.segment, active ? styles.segmentActive : null]}
          >
            <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>
              {labelFor(opt)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function RoundEditor({
  round,
  onSave,
  onCancel,
}: {
  round: RoundRecord;
  onSave: (edit: RoundEdit) => void;
  onCancel: () => void;
}) {
  const [winner, setWinner] = useState<Winner>(round.winner);
  const [playerPair, setPlayerPair] = useState<PairState>(round.playerPair);
  const [bankerPair, setBankerPair] = useState<PairState>(round.bankerPair);

  return (
    <View style={styles.editor} testID="round-editor">
      <Text style={styles.editorTitle}>Edit round {round.roundNumber}</Text>

      <Text style={styles.fieldLabel}>Winner</Text>
      <Segmented
        options={WINNERS}
        value={winner}
        labelFor={(w) => winnerLabel[w]}
        onChange={setWinner}
        testIDPrefix="edit-winner"
      />

      <Text style={styles.fieldLabel}>Player Pair</Text>
      <Segmented
        options={PAIR_STATES}
        value={playerPair}
        labelFor={(s) => s}
        onChange={setPlayerPair}
        testIDPrefix="edit-pp"
      />

      <Text style={styles.fieldLabel}>Banker Pair</Text>
      <Segmented
        options={PAIR_STATES}
        value={bankerPair}
        labelFor={(s) => s}
        onChange={setBankerPair}
        testIDPrefix="edit-bp"
      />

      <View style={styles.editorActions}>
        <Pressable testID="editor-cancel" onPress={onCancel} style={[styles.editorBtn, styles.cancel]}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          testID="editor-save"
          onPress={() => onSave({ winner, playerPair, bankerPair })}
          style={[styles.editorBtn, styles.save]}
        >
          <Text style={styles.saveText}>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function ReviewDataSheet({
  visible,
  rounds,
  onClose,
  onEdit,
  onDelete,
}: ReviewDataSheetProps) {
  const [editing, setEditing] = useState<RoundRecord | null>(null);

  const close = () => {
    setEditing(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="review-data-sheet">
          <View style={styles.header}>
            <Text style={styles.heading}>Review Data · {rounds.length} rounds</Text>
            <Pressable testID="review-close" onPress={close} style={styles.closeBtn}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          {editing ? (
            <RoundEditor
              round={editing}
              onCancel={() => setEditing(null)}
              onSave={(edit) => {
                onEdit(editing.roundNumber, edit);
                setEditing(null);
              }}
            />
          ) : (
            <FlatList
              data={rounds}
              keyExtractor={(r) => r.id}
              testID="review-list"
              ListEmptyComponent={<Text style={styles.empty}>No rounds recorded yet.</Text>}
              ListHeaderComponent={
                <View style={[styles.row, styles.rowHeader]}>
                  <Text style={[styles.cell, styles.colNum, styles.headText]}>#</Text>
                  <Text style={[styles.cell, styles.colWinner, styles.headText]}>Winner</Text>
                  <Text style={[styles.cell, styles.colPair, styles.headText]}>PP</Text>
                  <Text style={[styles.cell, styles.colPair, styles.headText]}>BP</Text>
                  <Text style={[styles.cell, styles.colSource, styles.headText]}>Source</Text>
                  <Text style={[styles.cell, styles.colActions, styles.headText]}>Actions</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.row} testID={`review-row-${item.roundNumber}`}>
                  <Text style={[styles.cell, styles.colNum, styles.bodyText]}>{item.roundNumber}</Text>
                  <Text style={[styles.cell, styles.colWinner, styles.bodyText, { color: winnerColor[item.winner], fontWeight: '800' }]}>
                    {winnerLabel[item.winner]}
                  </Text>
                  <Text style={[styles.cell, styles.colPair, styles.bodyText]}>{item.playerPair}</Text>
                  <Text style={[styles.cell, styles.colPair, styles.bodyText]}>{item.bankerPair}</Text>
                  <Text style={[styles.cell, styles.colSource, styles.bodyText]}>{item.source}</Text>
                  <View style={[styles.cell, styles.colActions, styles.actionCell]}>
                    <Pressable
                      testID={`review-edit-${item.roundNumber}`}
                      onPress={() => setEditing(item)}
                      style={[styles.actionBtn, styles.editAction]}
                    >
                      <Text style={styles.editActionText}>Edit</Text>
                    </Pressable>
                    <Pressable
                      testID={`review-delete-${item.roundNumber}`}
                      onPress={() => onDelete(item.roundNumber)}
                      style={[styles.actionBtn, styles.deleteAction]}
                    >
                      <Text style={styles.deleteActionText}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '92%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  heading: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  closeBtn: { minHeight: 44, paddingHorizontal: spacing.md, justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
  closeText: { color: colors.textPrimary, fontWeight: '700' },
  empty: { color: colors.textMuted, fontSize: 14, padding: spacing.lg, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowHeader: { borderBottomWidth: 1 },
  cell: { paddingHorizontal: spacing.xs },
  colNum: { width: 40 },
  colWinner: { width: 90 },
  colPair: { width: 80 },
  colSource: { width: 130 },
  colActions: { flex: 1, minWidth: 160 },
  headText: { color: colors.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  bodyText: { color: colors.textSecondary, fontSize: 13 },
  actionCell: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: { minHeight: 40, paddingHorizontal: spacing.md, justifyContent: 'center', borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth },
  editAction: { borderColor: colors.accent },
  editActionText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  deleteAction: { borderColor: colors.banker },
  deleteActionText: { color: colors.banker, fontWeight: '700', fontSize: 13 },
  editor: { gap: spacing.sm },
  editorTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800', marginBottom: spacing.sm },
  fieldLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginTop: spacing.sm },
  segmented: { flexDirection: 'row', borderRadius: radius.sm, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  segment: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  segmentActive: { backgroundColor: colors.accent },
  segmentText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  segmentTextActive: { color: '#FFFFFF' },
  editorActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.lg },
  editorBtn: { minHeight: 48, paddingHorizontal: spacing.xl, justifyContent: 'center', borderRadius: radius.sm },
  cancel: { backgroundColor: colors.surfaceRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  cancelText: { color: colors.textPrimary, fontWeight: '700' },
  save: { backgroundColor: colors.accent },
  saveText: { color: '#FFFFFF', fontWeight: '800' },
});
