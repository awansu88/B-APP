import { useMemo } from "react";
import { ScrollView, StyleSheet, Switch, Text, View, Pressable } from "react-native";

import { useBappData } from "@/src/workflows/backup/use-bapp-data";
import { usePreferences } from "@/src/workflows/preferences";
import { matcherReadinessFromDataset, buildMatcherSettingsView } from "@/src/domain/observability";
import {
  resolveShoeThresholdFromLocks,
  BALANCED_THRESHOLD_PRESETS,
  type BalancedThreshold,
} from "@/src/domain/decision";
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
  const matcherView = useMemo(
    () => (matcher ? buildMatcherSettingsView(matcher) : null),
    [matcher],
  );

  // M7.1 Patch 4 — the CURRENT shoe's immutable Balanced threshold, recovered
  // from the active shoe's own locks (works even under STRICT). 'LEGACY' = an
  // active pre-Patch-4 shoe (no BALCFG lock); null = no active/locked shoe yet.
  const currentShoe = useMemo(
    () => dataset?.shoes.find((s) => s.status === "ACTIVE") ?? null,
    [dataset],
  );
  const currentShoeThreshold = useMemo<BalancedThreshold | "LEGACY" | "CONFLICT" | null>(() => {
    if (!dataset || !currentShoe) return null;
    const locks = dataset.lockedPredictions
      .filter((r) => r.shoeId === currentShoe.id && !r.invalidated)
      .map((r) => {
        try {
          const p = JSON.parse(r.payload) as { balancedConfigVersion?: string; balancedThreshold?: number };
          return { balancedConfigVersion: p.balancedConfigVersion, balancedThreshold: p.balancedThreshold };
        } catch {
          return {};
        }
      });
    if (locks.length === 0) return null;
    try {
      const t = resolveShoeThresholdFromLocks(locks);
      return t ?? "LEGACY";
    } catch {
      return "CONFLICT";
    }
  }, [dataset, currentShoe]);
  const currentThresholdLabel =
    currentShoeThreshold == null
      ? "No active shoe"
      : currentShoeThreshold === "LEGACY"
        ? "0.55 (legacy DECISION-003)"
        : currentShoeThreshold === "CONFLICT"
          ? "INVARIANT CONFLICT"
          : `${currentShoeThreshold.toFixed(2)} LOCKED`;
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
                <Text style={styles.prefLabel}>Show Decision Comparison</Text>
                <Text style={styles.prefHint}>
                  Show the compact secondary STRICT-vs-BALANCED comparison (control telemetry).
                </Text>
              </View>
              <Switch
                testID="pref-decision-comparison"
                value={prefs.showDecisionComparison}
                onValueChange={prefs.setShowDecisionComparison}
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
              <Pressable
                testID="engine-mode-strict"
                onPress={() => prefs.setEngineMode("STRICT")}
                style={[styles.modeChip, prefs.engineMode === "STRICT" ? styles.modeChipActive : null]}
              >
                <Text style={styles.modeChipTitle}>
                  {prefs.engineMode === "STRICT" ? "\u25C9 " : "\u25CB "}STRICT
                </Text>
                <Text style={styles.modeChipSub}>DECISION-001 · Accepted · Threshold 0.55 LOCKED</Text>
              </Pressable>
              <Pressable
                testID="engine-mode-balanced"
                onPress={() => prefs.setEngineMode("BALANCED")}
                style={[styles.modeChip, prefs.engineMode === "BALANCED" ? styles.modeChipActive : null]}
              >
                <Text style={styles.modeChipTitle}>
                  {prefs.engineMode === "BALANCED" ? "\u25C9 " : "\u25CB "}BALANCED — Experimental
                </Text>
                <Text style={styles.modeChipSub}>
                  DECISION-004 · BALCFG-001 · {currentThresholdLabel}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.note} testID="engine-mode-note">
              STRICT (DECISION-001) is the accepted default. BALANCED (DECISION-003) is EXPERIMENTAL:
              it activates the Derived Road analyzer (STRUCTURE family) and the quality-gated Historical
              Matcher (HMATCH-002) while keeping every accepted confidence/threshold/risk rule unchanged.
              STRICT stays matcher-free and Volatility stays SHADOW_ONLY in both profiles. Switching mode
              never rewrites an already-locked target — it applies to the next unlocked prediction only.
            </Text>
          </Card>

          {prefs.engineMode === "BALANCED" ? (
            <Card title="Threshold Lab (BALANCED — Experimental)" testID="settings-threshold-lab" wide>
              <Row
                label="STRICT (DECISION-001)"
                value="Threshold 0.55 · LOCKED"
                valueColor={colors.textMuted}
                testID="threshold-strict-locked"
              />
              <Row
                label="Current Shoe Threshold"
                value={currentThresholdLabel}
                valueColor={typeof currentShoeThreshold === "number" ? colors.tie : colors.textSecondary}
                testID="threshold-current-shoe"
              />
              <SectionLabel>Next Shoe Threshold</SectionLabel>
              <View style={styles.presetRow}>
                {BALANCED_THRESHOLD_PRESETS.map((t) => {
                  const active = prefs.nextBalancedThreshold === t;
                  return (
                    <Pressable
                      key={t}
                      testID={`threshold-preset-${t.toFixed(2)}`}
                      onPress={() => prefs.setNextBalancedThreshold(t as BalancedThreshold)}
                      style={[styles.presetChip, active ? styles.presetChipActive : null]}
                    >
                      <Text style={[styles.presetText, active ? styles.presetTextActive : null]}>
                        {active ? "\u25C9 " : "\u25CB "}
                        {t.toFixed(2)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.note} testID="threshold-lab-note">
                Only the BET/SKIP confidence FLOOR changes (DECISION-004 / BALCFG-001) — every other gate
                (Data Quality, directional support, weighted agreement, conflict/opposition, risk and the
                confidence cap) stays mandatory, and the confidence value itself is unchanged. Presets are
                fixed (0.55 / 0.54 / 0.53 / 0.52) — no free entry. The Next-Shoe threshold becomes an
                immutable per-shoe value at Start Live; it never alters the current shoe. STRICT is the
                permanent control profile at 0.55.
              </Text>
            </Card>
          ) : null}

          <Card title="Historical Matcher" testID="settings-matcher" wide>
            <Row label="Collection" value="ACTIVE (from persisted history)" testID="matcher-collection" />
            <Row
              label="Completed Shoes"
              value={matcherView ? matcherView.completedShoesLabel : "—"}
              testID="matcher-shoes"
            />
            <Row
              label="Non-Tie Rounds"
              value={matcherView ? matcherView.nonTieRoundsLabel : "—"}
              testID="matcher-rounds"
            />
            <Row
              label="Eligibility"
              value={matcherView ? matcherView.eligibility : loading ? "computing…" : "—"}
              valueColor={matcherView?.eligible ? colors.tie : colors.textSecondary}
              testID="matcher-eligibility"
            />
            <SectionLabel>Voting</SectionLabel>
            <Row
              label="STRICT (DECISION-001)"
              value={matcherView ? matcherView.strictVoting : "DISABLED"}
              valueColor={colors.textMuted}
              testID="matcher-voting-strict"
            />
            <Row
              label="BALANCED (DECISION-003)"
              value={matcherView ? matcherView.balancedVoting : "WAITING FOR ELIGIBILITY"}
              valueColor={matcherView?.eligible ? colors.tie : colors.textSecondary}
              testID="matcher-voting-balanced"
            />
            <Text style={styles.note} testID="matcher-note">
              Derived from the authoritative shoes + rounds (no separate matcher database, no DB-003).
              Collection begins automatically from persisted history. The BALANCED matcher becomes
              eligible automatically once BOTH global thresholds pass (100 completed shoes AND 5,000
              non-Tie rounds); STRICT never receives the matcher vote. Eligibility does NOT guarantee a
              vote every round — the per-round matcher (HMATCH-002) may still ABSTAIN when its quality
              gates are not met. Thresholds are locked and not user-adjustable.
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
  presetRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", marginTop: 4 },
  presetChip: {
    minWidth: 72,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: "center",
  },
  presetChipActive: { borderColor: colors.accent, backgroundColor: colors.railActiveSurface },
  presetText: { color: colors.textSecondary, fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },
  presetTextActive: { color: colors.textPrimary },
});
