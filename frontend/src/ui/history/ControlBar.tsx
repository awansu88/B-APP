import { Pressable, StyleSheet, Text, View } from 'react-native';

import { InputDraft, PairInputMode } from '@/src/domain/history';
import { Winner } from '@/src/domain/models/outcome';
import { OperatorAction } from '@/src/domain/session';
import { colors, radius, spacing } from '../theme';

interface ControlBarProps {
  readonly draft: InputDraft;
  readonly disabled: boolean;
  /** Gates the actual-result P/T/B + pair controls. Defaults to `disabled`. */
  readonly resultDisabled?: boolean;
  readonly canUndo: boolean;
  /** Gates Edit/Delete Round (opens Review Data). Defaults to `canUndo`. */
  readonly canReview?: boolean;
  readonly canStart: boolean;
  readonly liveMode?: boolean;
  readonly operatorAction?: OperatorAction;
  readonly operatorPlayedDisabled?: boolean;
  readonly onSetOperatorAction?: (action: OperatorAction) => void;
  readonly onSelectWinner: (winner: Winner) => void;
  readonly onTogglePlayerPair: () => void;
  readonly onToggleBankerPair: () => void;
  readonly onSetPairMode: (mode: PairInputMode) => void;
  readonly onUndo: () => void;
  readonly onEditRound: () => void;
  readonly onDeleteRound: () => void;
  readonly onNewShoe: () => void;
  readonly onClearShoe: () => void;
  readonly onStartLive: () => void;
  readonly onStartHistoricalTest: () => void;
}

function ResultButton({
  label,
  color,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  color: string;
  onPress: () => void;
  disabled: boolean;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.resultBtn,
        { backgroundColor: color },
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Text style={styles.resultBtnText}>{label}</Text>
    </Pressable>
  );
}

function Toggle({
  label,
  active,
  color,
  onPress,
  disabled,
  testID,
  wide = false,
}: {
  label: string;
  active: boolean;
  color: string;
  onPress: () => void;
  disabled: boolean;
  testID: string;
  wide?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.toggle,
        wide ? styles.toggleWide : null,
        active ? { backgroundColor: color, borderColor: color } : null,
        disabled ? styles.disabled : null,
      ]}
      accessibilityRole="switch"
      accessibilityState={{ checked: active, disabled }}
    >
      <Text style={[styles.toggleText, active ? styles.toggleTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({
  label,
  onPress,
  disabled,
  tone = 'default',
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  tone?: 'default' | 'danger' | 'primary';
  testID: string;
}) {
  const toneStyle =
    tone === 'danger'
      ? styles.dangerBtn
      : tone === 'primary'
        ? styles.primaryBtn
        : styles.secondaryBtn;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.secondaryBase,
        toneStyle,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Text
        style={[
          styles.secondaryText,
          tone === 'danger' ? { color: colors.banker } : null,
          tone === 'primary' ? { color: '#FFFFFF' } : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ControlBar(props: ControlBarProps) {
  const { draft, disabled } = props;
  const resultDisabled = props.resultDisabled ?? disabled;
  const canReview = props.canReview ?? props.canUndo;
  const isComplete = draft.pairMode === PairInputMode.COMPLETE;

  return (
    <View style={styles.bar} testID="control-bar">
      <View style={styles.primaryRow}>
        {/* Exact order: P / T / B */}
        <ResultButton
          testID="btn-player"
          label="PLAYER"
          color={colors.player}
          onPress={() => props.onSelectWinner(Winner.PLAYER)}
          disabled={resultDisabled}
        />
        <ResultButton
          testID="btn-tie"
          label="TIE"
          color={colors.tie}
          onPress={() => props.onSelectWinner(Winner.TIE)}
          disabled={resultDisabled}
        />
        <ResultButton
          testID="btn-banker"
          label="BANKER"
          color={colors.banker}
          onPress={() => props.onSelectWinner(Winner.BANKER)}
          disabled={resultDisabled}
        />

        <View style={styles.pairGroup}>
          <Toggle
            testID="toggle-pp"
            label="PP"
            active={draft.playerPairSelected}
            color={colors.player}
            onPress={props.onTogglePlayerPair}
            disabled={resultDisabled}
          />
          <Toggle
            testID="toggle-bp"
            label="BP"
            active={draft.bankerPairSelected}
            color={colors.banker}
            onPress={props.onToggleBankerPair}
            disabled={resultDisabled}
          />
        </View>

        <View style={styles.modeGroup}>
          <Text style={styles.modeLabel}>Pairs</Text>
          <View style={styles.modeSwitch}>
            <Pressable
              testID="mode-partial"
              onPress={() => props.onSetPairMode(PairInputMode.PARTIAL)}
              disabled={resultDisabled}
              style={[styles.modeOption, !isComplete ? styles.modeOptionActive : null]}
            >
              <Text style={[styles.modeText, !isComplete ? styles.modeTextActive : null]}>Partial</Text>
            </Pressable>
            <Pressable
              testID="mode-complete"
              onPress={() => props.onSetPairMode(PairInputMode.COMPLETE)}
              disabled={resultDisabled}
              style={[styles.modeOption, isComplete ? styles.modeOptionActive : null]}
            >
              <Text style={[styles.modeText, isComplete ? styles.modeTextActive : null]}>Complete</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.secondaryRow}>
        {props.liveMode ? (
          <>
            <Toggle
              testID="op-played"
              label="PLAYED"
              active={props.operatorAction === OperatorAction.PLAYED && !props.operatorPlayedDisabled}
              color={colors.accent}
              onPress={() => props.onSetOperatorAction?.(OperatorAction.PLAYED)}
              disabled={disabled || !!props.operatorPlayedDisabled}
              wide
            />
            <Toggle
              testID="op-not-played"
              label="NOT PLAYED"
              active={props.operatorAction === OperatorAction.NOT_PLAYED || !!props.operatorPlayedDisabled}
              color={colors.accent}
              onPress={() => props.onSetOperatorAction?.(OperatorAction.NOT_PLAYED)}
              disabled={disabled}
              wide
            />
            <SecondaryButton testID="btn-review" label="Review" onPress={props.onEditRound} disabled={disabled || !canReview} />
            <SecondaryButton testID="btn-new-shoe" label="New Shoe" onPress={props.onNewShoe} disabled={disabled} />
          </>
        ) : (
          <>
            <SecondaryButton testID="btn-undo" label="Undo" onPress={props.onUndo} disabled={disabled || !props.canUndo} />
            <SecondaryButton testID="btn-edit" label="Edit Round" onPress={props.onEditRound} disabled={disabled || !canReview} />
            <SecondaryButton testID="btn-delete" label="Delete Round" onPress={props.onDeleteRound} disabled={disabled || !canReview} />
            <SecondaryButton testID="btn-new-shoe" label="New Shoe" onPress={props.onNewShoe} disabled={disabled} />
            <SecondaryButton testID="btn-clear-shoe" label="Clear Shoe" tone="danger" onPress={props.onClearShoe} disabled={disabled || !props.canUndo} />
            <SecondaryButton testID="btn-start-live" label="Start Live" tone="primary" onPress={props.onStartLive} disabled={disabled || !props.canStart} />
            <SecondaryButton testID="btn-start-historical" label="Start Historical Test" tone="primary" onPress={props.onStartHistoricalTest} disabled={disabled || !props.canStart} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  primaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  resultBtn: {
    flex: 1,
    height: 64,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultBtnText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1,
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
  pairGroup: { flexDirection: 'row', gap: spacing.xs },
  toggle: {
    width: 54,
    height: 64,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  toggleWide: { width: 104, height: 44 },
  toggleText: { color: colors.textSecondary, fontSize: 15, fontWeight: '800' },
  toggleTextActive: { color: '#FFFFFF' },
  modeGroup: { alignItems: 'center', gap: 4 },
  modeLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  modeSwitch: {
    flexDirection: 'row',
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  modeOption: {
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    minHeight: 44,
    justifyContent: 'center',
  },
  modeOptionActive: { backgroundColor: colors.accent },
  modeText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  modeTextActive: { color: '#FFFFFF' },
  secondaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  secondaryBase: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  secondaryBtn: { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
  dangerBtn: { backgroundColor: 'transparent', borderColor: colors.banker },
  primaryBtn: { backgroundColor: colors.accent, borderColor: colors.accent },
  secondaryText: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
});
