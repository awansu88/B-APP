/** Compact, read-only presentation of the already-locked live decision. */
import { StyleSheet, Text, View } from 'react-native';

import { PredictionDecision } from '@/src/domain/models/enums';
import { LeanSide } from '@/src/domain/observability';
import type { SessionState } from '@/src/domain/session';
import { colors, radius, spacing } from '@/src/ui/theme';
import { compactLiveView } from './compact-live-view';

interface Props {
  readonly state: SessionState;
}

const decisionColor = (decision: PredictionDecision): string =>
  decision === PredictionDecision.BET_PLAYER
    ? colors.player
    : decision === PredictionDecision.BET_BANKER
      ? colors.banker
      : colors.textMuted;

const leanColor = (side: LeanSide): string =>
  side === LeanSide.PLAYER
    ? colors.player
    : side === LeanSide.BANKER
      ? colors.banker
      : colors.textMuted;

export function LiveSessionPanel({ state }: Props) {
  const prediction = state.currentPrediction;
  const view = compactLiveView(prediction);

  return (
    <View style={styles.strip} testID="live-panel">
      <View style={styles.field}>
        <Text style={styles.label}>RECOMMENDATION</Text>
        <Text
          style={[styles.value, { color: prediction ? decisionColor(prediction.decision) : colors.textMuted }]}
          testID="live-decision"
        >
          {view.recommendation}
        </Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.field}>
        <Text style={styles.label}>LEAN</Text>
        <Text style={[styles.value, { color: view.lean ? leanColor(view.lean) : colors.textMuted }]} testID="live-lean">
          {view.lean ?? '—'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  field: { flex: 1, justifyContent: 'center', gap: 2 },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  value: { fontSize: 22, fontWeight: '900', letterSpacing: 1 },
});
