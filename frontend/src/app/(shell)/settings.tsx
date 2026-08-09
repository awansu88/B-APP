import { useMemo } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { useBappData } from "@/src/workflows/backup/use-bapp-data";
import { usePreferences } from "@/src/workflows/preferences";
import { matcherReadinessFromDataset } from "@/src/domain/observability";
import { buildDiagnosticsSnapshot } from "@/src/diagnostics";
import { Banner, Card, Row, ScreenHeader, SectionLabel } from "@/src/ui/data/cards";
import { colors, radius, spacing } from "@/src/ui/theme";

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
  const { dataset, runtime, loading } = useBappData();
  const prefs = usePreferences();
  const snapshot = useMemo(() => buildDiagnosticsSnapshot(), []);
  const matcher = useMemo(
    () => (dataset ? matcherReadinessFromDataset(dataset) : null),
    [dataset],
  );
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
          <Card title="Display Preferences" testID="settings-preferences">
            <View style={styles.prefRow}>
              <View style={styles.prefText}>
                <Text style={styles.prefLabel}>Show Directional Lean</Text>
                <Text style={styles.prefHint}>
                  On a SKIP, show a non-actionable lean + Why-Skip in the Live panel.
                </Text>
              </View>
              <Switch
                testID="pref-directional-lean"
                value={prefs.showDirectionalLean}
                onValueChange={prefs.setShowDirectionalLean}
                trackColor={{ true: colors.accent, false: colors.border }}
              />
            </View>
            <View style={styles.prefRow}>
              <View style={styles.prefText}>
                <Text style={styles.prefLabel}>Show Decision Details</Text>
                <Text style={styles.prefHint}>
                  Show the compact decision/comparison trace (scores, families, conflict).
                </Text>
              </View>
              <Switch
                testID="pref-decision-details"
                value={prefs.showDecisionDetails}
                onValueChange={prefs.setShowDecisionDetails}
                trackColor={{ true: colors.accent, false: colors.border }}
              />
            </View>
            <Text style={styles.note}>
              Presentation only — no engine values change. Reliability, voting, confidence,
              risk, warm-up and matcher thresholds stay locked.
            </Text>
          </Card>

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

          <Card title="Engine Mode" testID="settings-engine-mode" wide>
            <View style={styles.modeRow}>
              <View style={[styles.modeChip, styles.modeChipActive]} testID="engine-mode-strict">
                <Text style={styles.modeChipTitle}>STRICT</Text>
                <Text style={styles.modeChipSub}>DECISION-001 · active</Text>
              </View>
              <View style={[styles.modeChip, styles.modeChipDisabled]} testID="engine-mode-balanced">
                <Text style={styles.modeChipTitleMuted}>BALANCED — Experimental</Text>
                <Text style={styles.modeChipSub}>DECISION-002 · Not enabled in this patch</Text>
              </View>
            </View>
            <Text style={styles.note}>
              Only STRICT (DECISION-001) is selectable. The Balanced profile is a placeholder for a
              future patch and cannot be selected here.
            </Text>
          </Card>

          <Card title="Historical Matcher" testID="settings-matcher" wide>
            <Row label="Collection" value="ACTIVE (from first persisted shoe)" testID="matcher-collection" />
            <Row
              label="Completed Shoes"
              value={matcher ? `${matcher.completedShoes} / ${matcher.requiredShoes}` : "—"}
              testID="matcher-shoes"
            />
            <Row
              label="Non-Tie Rounds"
              value={
                matcher
                  ? `${matcher.nonTieRounds.toLocaleString()} / ${matcher.requiredNonTieRounds.toLocaleString()}`
                  : "—"
              }
              testID="matcher-rounds"
            />
            <Row
              label="Eligibility"
              value={matcher ? matcher.eligibility : loading ? "computing…" : "—"}
              valueColor={matcher?.eligibility === "ELIGIBLE" ? colors.tie : colors.textSecondary}
              testID="matcher-eligibility"
            />
            <Row label="Voting" value="DISABLED IN DECISION-001" valueColor={colors.textMuted} testID="matcher-voting" />
            <Text style={styles.note}>
              Derived from the authoritative shoes + rounds (no separate matcher database, no DB-003).
              ELIGIBLE does not activate matching or voting in this patch. Completed-shoe counting uses
              ShoeStatus COMPLETED/ARCHIVED; if the accepted workflow does not yet transition shoes out of
              ACTIVE, this count stays at 0 until a shoe-completion step is added in a later patch.
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
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  prefText: { flex: 1, gap: 2 },
  prefLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  prefHint: { color: colors.textMuted, fontSize: 11, lineHeight: 15 },
  modeRow: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
  modeChip: {
    flex: 1,
    minWidth: 200,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
  },
  modeChipActive: { borderColor: colors.accent, backgroundColor: colors.railActiveSurface },
  modeChipDisabled: { opacity: 0.55 },
  modeChipTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },
  modeChipTitleMuted: { color: colors.textSecondary, fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },
  modeChipSub: { color: colors.textMuted, fontSize: 11 },
});
