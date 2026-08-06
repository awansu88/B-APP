import { StyleSheet, Text, View } from 'react-native';

import type { ShoeStatistics } from '@/src/domain/history';
import { SessionEnvironment } from '@/src/domain/models/enums';
import type { ShoeRecord } from '@/src/domain/models/records';
import { colors, radius, spacing } from '../theme';

const envLabel: Record<SessionEnvironment, string> = {
  [SessionEnvironment.HISTORY_INPUT]: 'History Input',
  [SessionEnvironment.LIVE_FORWARD]: 'Live Forward',
  [SessionEnvironment.HISTORICAL_TEST]: 'Historical Test',
};

function StatRow({
  label,
  value,
  color,
  testID,
}: {
  label: string;
  value: string | number;
  color?: string;
  testID?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, color ? { color } : null]} testID={testID}>
        {value}
      </Text>
    </View>
  );
}

export function ShoeInfoPanel({
  shoe,
  statistics,
  canStart,
  nonTieRemaining,
  historyConfirmed,
}: {
  shoe: ShoeRecord | null;
  statistics: ShoeStatistics;
  canStart: boolean;
  nonTieRemaining: number;
  historyConfirmed: boolean;
}) {
  const status = historyConfirmed
    ? 'Confirmed'
    : canStart
      ? 'Ready to start'
      : `Warm-up: ${nonTieRemaining} more non-Tie`;
  const statusColor = historyConfirmed
    ? colors.tie
    : canStart
      ? colors.accent
      : colors.textMuted;

  return (
    <View style={styles.panel} testID="shoe-info-panel">
      <Text style={styles.heading}>Shoe Information</Text>
      <Text style={styles.shoeId} numberOfLines={1}>
        {shoe ? (shoe.label ?? shoe.id) : '—'}
      </Text>
      <Text style={styles.env}>{shoe ? envLabel[shoe.environment] : ''}</Text>

      <View style={styles.divider} />

      <StatRow label="Total rounds" value={statistics.totalRounds} testID="stat-total" />
      <StatRow label="Non-Tie rounds" value={statistics.nonTieRounds} testID="stat-nontie" />

      <View style={styles.divider} />

      <StatRow label="Player" value={statistics.playerTotal} color={colors.player} testID="stat-player" />
      <StatRow label="Tie" value={statistics.tieTotal} color={colors.tie} testID="stat-tie" />
      <StatRow label="Banker" value={statistics.bankerTotal} color={colors.banker} testID="stat-banker" />

      <View style={styles.divider} />

      <Text style={styles.rowLabel}>History confirmation</Text>
      <View style={[styles.statusChip, { borderColor: statusColor }]}>
        <Text style={[styles.statusText, { color: statusColor }]} testID="history-status">
          {status}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: 240,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
  },
  heading: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  shoeId: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  env: { color: colors.accent, fontSize: 12, fontWeight: '600', marginTop: 2 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  rowLabel: { color: colors.textSecondary, fontSize: 13 },
  rowValue: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  statusChip: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  statusText: { fontSize: 13, fontWeight: '700' },
});
