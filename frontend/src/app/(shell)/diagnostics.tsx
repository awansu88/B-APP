import { useMemo } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { useBappData } from "@/src/workflows/backup/use-bapp-data";
import { buildDiagnosticsSnapshot } from "@/src/diagnostics";
import { checkIntegrity } from "@/src/domain/diagnostics";
import { VERSION_REGISTRY } from "@/src/config/versions";
import { ActionButton, Banner, Card, Row, ScreenHeader } from "@/src/ui/data/cards";
import { colors, spacing } from "@/src/ui/theme";

/**
 * Diagnostics (Milestone 6) — READ-ONLY integrity + version registry. No
 * auto-repair, no mutation. Opening / running diagnostics never writes data.
 */
export default function DiagnosticsScreen() {
  const { dataset, runtime, loading, error, reload } = useBappData();
  const snapshot = useMemo(() => buildDiagnosticsSnapshot(), []);
  const integrity = useMemo(
    () => (dataset ? checkIntegrity(dataset, { schemaVersion: VERSION_REGISTRY.databaseSchema }) : null),
    [dataset],
  );
  const versionRows = Object.entries(snapshot.versions);

  return (
    <View style={styles.screen} testID="screen-diagnostics">
      <ScreenHeader
        title="Diagnostics"
        subtitle="Read-only integrity checks and the locked version registry."
        icon="stethoscope"
        testID="screen-diagnostics-title"
        right={<ActionButton label="Re-run" icon="refresh" onPress={reload} testID="diagnostics-refresh" />}
      />

      <View style={styles.bannerWrap}>
        <Banner
          tone="info"
          testID="diagnostics-adapter"
          text={`Active persistence adapter: ${runtime ?? "…"}${runtime === "web-preview" ? " (read-only preview)" : ""}`}
        />
      </View>

      {loading ? (
        <View style={styles.center} testID="diagnostics-loading">
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : error ? (
        <Text style={styles.error} testID="diagnostics-error">{error}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.grid}>
            {integrity ? (
              <Card title="Integrity" testID="diagnostics-integrity">
                <Row label="Schema version" value={integrity.schemaVersion} testID="diag-schema" />
                <Row label="Shoes" value={integrity.shoeCount} />
                <Row label="Rounds" value={integrity.roundCount} />
                <Row label="Locked predictions" value={integrity.lockedPredictionCount} />
                <Row label="Invalidated predictions" value={integrity.invalidatedPredictionCount} />
                {integrity.checks.map((c) => (
                  <Row
                    key={c.id}
                    label={c.label}
                    value={c.ok ? `OK (${c.detail})` : `FAIL (${c.detail})`}
                    valueColor={c.ok ? colors.tie : colors.banker}
                    testID={`diag-check-${c.id}`}
                  />
                ))}
              </Card>
            ) : null}

            <Card title="Version Registry" testID="diagnostics-versions">
              {versionRows.map(([key, value]) => (
                <Row key={key} label={key} value={String(value)} testID={`version-${key}`} />
              ))}
            </Card>

            <Card title="Analyzer Modes" testID="diagnostics-analyzers">
              {snapshot.analyzers.map((a) => (
                <Row key={a.id} label={a.label} value={a.mode} />
              ))}
            </Card>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  bannerWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { color: colors.banker, fontSize: 13, padding: spacing.lg },
  content: { padding: spacing.lg, gap: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
});
