import { StyleSheet, Text, View } from "react-native";

import { buildDiagnosticsSnapshot } from "@/src/diagnostics";
import { PlaceholderScreen } from "@/src/ui/PlaceholderScreen";
import { colors, radius, spacing } from "@/src/ui/theme";

export default function DiagnosticsScreen() {
  const snapshot = buildDiagnosticsSnapshot();
  const versionRows = Object.entries(snapshot.versions);

  return (
    <PlaceholderScreen
      testID="screen-diagnostics"
      title="Diagnostics"
      subtitle="Read-only view of the locked version registry and analyzer modes."
      icon="stethoscope"
    >
      <View style={styles.card} testID="diagnostics-versions">
        <Text style={styles.cardTitle}>Version Registry</Text>
        {versionRows.map(([key, value]) => (
          <View style={styles.row} key={key}>
            <Text style={styles.rowKey}>{key}</Text>
            <Text style={styles.rowValue} testID={`version-${key}`}>
              {String(value)}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.card} testID="diagnostics-analyzers">
        <Text style={styles.cardTitle}>Analyzer Modes</Text>
        {snapshot.analyzers.map((analyzer) => (
          <View style={styles.row} key={analyzer.id}>
            <Text style={styles.rowKey}>{analyzer.label}</Text>
            <Text style={styles.rowValue}>{analyzer.mode}</Text>
          </View>
        ))}
      </View>
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  rowKey: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  rowValue: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
});
