import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../theme';

interface CheckpointBannerProps {
  readonly totalRounds: number;
  readonly canStart: boolean;
  readonly onContinue: () => void;
  readonly onReview: () => void;
  readonly onStartLive: () => void;
}

/**
 * A non-blocking history checkpoint banner. It floats above the roadmap area
 * (never covering the input controls) and offers Continue Input, Review Data,
 * and Start Live. Shown at rounds 15/20/30 and every additional 10 rounds.
 */
export function CheckpointBanner({
  totalRounds,
  canStart,
  onContinue,
  onReview,
  onStartLive,
}: CheckpointBannerProps) {
  return (
    <View style={styles.banner} testID="checkpoint-banner">
      <View style={styles.textWrap}>
        <Text style={styles.title}>Checkpoint · {totalRounds} rounds</Text>
        <Text style={styles.subtitle}>
          Good moment to review your data or start a forward session.
        </Text>
      </View>
      <View style={styles.actions}>
        <Pressable testID="checkpoint-continue" onPress={onContinue} style={[styles.btn, styles.ghost]}>
          <Text style={styles.ghostText}>Continue Input</Text>
        </Pressable>
        <Pressable testID="checkpoint-review" onPress={onReview} style={[styles.btn, styles.ghost]}>
          <Text style={styles.ghostText}>Review Data</Text>
        </Pressable>
        <Pressable
          testID="checkpoint-start-live"
          onPress={onStartLive}
          disabled={!canStart}
          style={[styles.btn, styles.primary, !canStart ? styles.disabled : null]}
        >
          <Text style={styles.primaryText}>Start Live</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: colors.railActiveSurface,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    flexWrap: 'wrap',
  },
  textWrap: { flexShrink: 1, minWidth: 180 },
  title: { color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  btn: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.sm, justifyContent: 'center' },
  ghost: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  ghostText: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  primary: { backgroundColor: colors.accent },
  primaryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  disabled: { opacity: 0.4 },
});
