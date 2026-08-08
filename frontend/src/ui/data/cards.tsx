/**
 * Milestone 6 \u2014 compact, tablet-first card / row primitives shared by the
 * Statistics, Export and Diagnostics screens. No advanced charting (Milestone 7
 * owns final visual polish).
 */
import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, radius, spacing } from '../theme';
import type { RateFraction } from '@/src/domain/statistics';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export function ScreenHeader({
  title,
  subtitle,
  icon,
  right,
  testID,
}: {
  title: string;
  subtitle: string;
  icon: IconName;
  right?: ReactNode;
  testID?: string;
}) {
  return (
    <View style={styles.header} testID={testID}>
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons name={icon} size={24} color={colors.accent} />
      </View>
      <View style={styles.headerText}>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerSub}>{subtitle}</Text>
      </View>
      {right ? <View style={styles.headerRight}>{right}</View> : null}
    </View>
  );
}

export function ActionButton({
  label,
  onPress,
  icon,
  tone = 'default',
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  tone?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={({ pressed }) => [
        styles.action,
        tone === 'primary' && styles.actionPrimary,
        tone === 'danger' && styles.actionDanger,
        disabled && styles.actionDisabled,
        pressed && !disabled && styles.actionPressed,
      ]}
    >
      {icon ? (
        <MaterialCommunityIcons
          name={icon}
          size={16}
          color={disabled ? colors.textMuted : colors.textPrimary}
        />
      ) : null}
      <Text style={[styles.actionLabel, disabled && styles.actionLabelDisabled]}>{label}</Text>
    </Pressable>
  );
}


export function Card({
  title,
  children,
  testID,
  wide,
}: {
  title: string;
  children: ReactNode;
  testID?: string;
  wide?: boolean;
}) {
  return (
    <View style={[styles.card, wide && styles.cardWide]} testID={testID}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

export function Row({
  label,
  value,
  valueColor,
  testID,
}: {
  label: string;
  value: string | number;
  valueColor?: string;
  testID?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowKey}>{label}</Text>
      <Text style={[styles.rowValue, valueColor ? { color: valueColor } : null]} testID={testID}>
        {String(value)}
      </Text>
    </View>
  );
}

/** Format a numerator/denominator rate with an explicit fraction + percent. */
export function fractionLabel(f: RateFraction): string {
  const pct = f.percent == null ? '\u2014' : `${f.percent.toFixed(1)}%`;
  return `${f.numerator} / ${f.denominator}  (${pct})`;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function Banner({
  tone,
  text,
  testID,
}: {
  tone: 'info' | 'warn';
  text: string;
  testID?: string;
}) {
  return (
    <View
      style={[styles.banner, tone === 'warn' ? styles.bannerWarn : styles.bannerInfo]}
      testID={testID}
    >
      <Text style={styles.bannerText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
    minWidth: 320,
    flexGrow: 1,
    flexBasis: 340,
  },
  cardWide: {
    flexBasis: '100%',
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  cardBody: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  rowKey: {
    color: colors.textSecondary,
    fontSize: 13,
    flexShrink: 1,
    paddingRight: spacing.sm,
  },
  rowValue: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
    marginBottom: 2,
  },
  banner: {
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bannerInfo: {
    backgroundColor: colors.railActiveSurface,
    borderColor: colors.accent,
  },
  bannerWarn: {
    backgroundColor: '#2A1E12',
    borderColor: '#B4791F',
  },
  bannerText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  headerText: { flex: 1 },
  headerTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '800' },
  headerSub: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  actionPrimary: { backgroundColor: colors.railActiveSurface, borderColor: colors.accent },
  actionDanger: { backgroundColor: '#2A1414', borderColor: colors.banker },
  actionDisabled: { opacity: 0.45 },
  actionPressed: { opacity: 0.7 },
  actionLabel: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  actionLabelDisabled: { color: colors.textMuted },
});
