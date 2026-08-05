import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from './theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

interface PlaceholderScreenProps {
  readonly testID: string;
  readonly title: string;
  readonly subtitle: string;
  readonly icon: IconName;
  readonly children?: ReactNode;
}

/**
 * A navigable placeholder screen. Milestone 0 ships the shell only — no
 * baccarat logic is implemented in any route yet.
 */
export function PlaceholderScreen({
  testID,
  title,
  subtitle,
  icon,
  children,
}: PlaceholderScreenProps) {
  return (
    <ScrollView
      testID={testID}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name={icon} size={28} color={colors.accent} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title} testID={`${testID}-title`}>
            {title}
          </Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      </View>

      <View style={styles.badge} testID={`${testID}-milestone-badge`}>
        <MaterialCommunityIcons
          name="lock-outline"
          size={14}
          color={colors.textSecondary}
        />
        <Text style={styles.badgeText}>
          Milestone 0 — placeholder (no engine logic yet)
        </Text>
      </View>

      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  badgeText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
});
