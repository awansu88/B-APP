import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Href, usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from './theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

interface NavItem {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly icon: IconName;
  /** Matched against the active pathname to determine the selected state. */
  readonly match: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'active-shoe', label: 'Active Shoe', href: '/', icon: 'cards-playing-outline', match: '/' },
  { key: 'history', label: 'History', href: '/history', icon: 'history', match: '/history' },
  { key: 'statistics', label: 'Statistics', href: '/statistics', icon: 'chart-bar', match: '/statistics' },
  { key: 'export', label: 'Export', href: '/export', icon: 'export-variant', match: '/export' },
  { key: 'diagnostics', label: 'Diagnostics', href: '/diagnostics', icon: 'stethoscope', match: '/diagnostics' },
  { key: 'settings', label: 'Settings', href: '/settings', icon: 'cog-outline', match: '/settings' },
];

export function NavRail() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <View style={styles.rail} testID="nav-rail">
      <View style={styles.brand}>
        <MaterialCommunityIcons name="cards" size={26} color={colors.accent} />
        <Text style={styles.brandTitle}>B-APP</Text>
        <Text style={styles.brandSub}>Baccarat Engine</Text>
      </View>

      <View style={styles.items}>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.match;
          return (
            <Pressable
              key={item.key}
              testID={`nav-item-${item.key}`}
              onPress={() => router.replace(item.href as Href)}
              style={[styles.item, active && styles.itemActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <MaterialCommunityIcons
                name={item.icon}
                size={22}
                color={active ? colors.textPrimary : colors.textSecondary}
              />
              <Text style={[styles.itemLabel, active && styles.itemLabelActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: 220,
    backgroundColor: colors.surface,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  brand: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.lg,
    marginBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  brandTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    marginTop: spacing.sm,
    letterSpacing: 1,
  },
  brandSub: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  items: {
    gap: spacing.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    minHeight: 48,
  },
  itemActive: {
    backgroundColor: colors.railActiveSurface,
  },
  itemLabel: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  itemLabelActive: {
    color: colors.textPrimary,
  },
});
