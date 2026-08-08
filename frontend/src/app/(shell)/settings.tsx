import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { useBappData } from "@/src/workflows/backup/use-bapp-data";
import { buildDiagnosticsSnapshot } from "@/src/diagnostics";
import { Banner, Card, Row, ScreenHeader, SectionLabel } from "@/src/ui/data/cards";
import { colors, spacing } from "@/src/ui/theme";

/**
 * Settings / About / System Information (Milestone 7A) — READ-ONLY.
 *
 * Presents B-APP identity, the locked version registry, the current database
 * schema (DB-002), the active persistence adapter and the local-first/offline
 * model. Engine information is kept SECONDARY (an "Engine / System Status"
 * section). There are NO configuration controls: analyzer modes, reliability,
 * voting, confidence thresholds, risk rules, the Historical Matcher / Derived
 * Road / Volatility modes and the database schema are locked and versioned and
 * cannot be changed here.
 */
export default function SettingsScreen() {
  const { runtime, loading } = useBappData();
  const snapshot = useMemo(() => buildDiagnosticsSnapshot(), []);
  const v = snapshot.versions;

  const adapter =
    runtime == null
      ? loading
        ? "resolving…"
        : "unknown"
      : runtime === "web-preview"
        ? "web-preview (AsyncStorage, read-only preview)"
        : `${runtime} (SQLite / DB-002)`;

  return (
    <View style={styles.screen} testID="screen-settings">
      <ScreenHeader
        title="Settings"
        subtitle="About, system information and locked engine status."
        icon="cog-outline"
        testID="screen-settings-title"
      />

      <View style={styles.bannerWrap}>
        <Banner
          tone="info"
          testID="settings-readonly-banner"
          text="Read-only. Engine configuration is locked and versioned — there are no adjustable settings in the MVP."
        />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
          <Card title="Application" testID="settings-application">
            <Row label="Name" value="B-APP Baccarat Engine" testID="settings-app-name" />
            <Row label="App version" value={String(v.app)} testID="settings-app-version" />
            <Row label="Android package" value="com.bapp.baccaratengine" />
            <Row label="Orientation" value="Landscape (tablet-first)" />
            <Row label="Target device" value="Samsung Galaxy Tab S7 FE" />
          </Card>

          <Card title="Data & Persistence" testID="settings-persistence">
            <Row label="Database schema" value={String(v.databaseSchema)} testID="settings-db-schema" />
            <Row label="Active adapter" value={adapter} testID="settings-adapter" />
            <Row label="Local-first / offline" value="Yes" />
            <Row label="Cloud sync" value="None" />
            <Row label="Backend / network" value="None" />
          </Card>

          <Card title="Engine / System Status" testID="settings-engine" wide>
            <SectionLabel>Locked version registry</SectionLabel>
            <Row label="Engine" value={String(v.engine)} />
            <Row label="Config" value={String(v.config)} />
            <Row label="Roadmap" value={String(v.roadmap)} />
            <Row label="Feature" value={String(v.feature)} />
            <Row label="Voting" value={String(v.voting)} />
            <Row label="Confidence" value={String(v.confidence)} />
            <Row label="Risk" value={String(v.risk)} />

            <SectionLabel>Analyzer modes (locked)</SectionLabel>
            {snapshot.analyzers.map((a) => (
              <Row
                key={a.id}
                label={a.label}
                value={a.mode}
                valueColor={
                  a.mode === "DISABLED"
                    ? colors.textMuted
                    : a.mode === "SHADOW_ONLY"
                      ? colors.tie
                      : colors.textPrimary
                }
              />
            ))}

            <SectionLabel>Thresholds (locked)</SectionLabel>
            <Row label="Warm-up (non-Tie)" value={snapshot.thresholds.minWarmupNonTie} />
            <Row
              label="Max uncalibrated confidence"
              value={snapshot.thresholds.maxUncalibratedConfidence}
            />
            <Text style={styles.note} testID="settings-engine-note">
              Historical Matcher stays DISABLED; Derived Road and Volatility stay SHADOW_ONLY.
              Financial tracking is fixed-unit paper only. These are versioned engine decisions
              and are not user-adjustable.
            </Text>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  bannerWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  content: { padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  note: { color: colors.textMuted, fontSize: 12, marginTop: spacing.sm, lineHeight: 17 },
});
