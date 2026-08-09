import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useBappData } from "@/src/workflows/backup/use-bapp-data";
import { computeFullStatistics } from "@/src/domain/statistics";
import { computeAvailabilityFromDataset, computeNearThresholdFromDataset, computeProfileComparisonFromDataset, matcherReadinessFromDataset } from "@/src/domain/observability";
import { StatsView } from "@/src/ui/stats/StatsView";
import { DecisionAvailabilityCard } from "@/src/ui/stats/DecisionAvailabilityCard";
import { ProfileComparisonCard } from "@/src/ui/stats/ProfileComparisonCard";
import { NearThresholdDiagnosticsCard } from "@/src/ui/stats/NearThresholdDiagnosticsCard";
import { ActionButton, Banner, ScreenHeader } from "@/src/ui/data/cards";
import { colors, spacing } from "@/src/ui/theme";

/**
 * Statistics (Milestone 6) — pure deterministic report over the authoritative
 * dataset projection. Read-only; no engine changes.
 */
export default function StatisticsScreen() {
  const { dataset, runtime, loading, error, reload } = useBappData();
  const stats = useMemo(() => (dataset ? computeFullStatistics(dataset) : null), [dataset]);
  const availability = useMemo(
    () => (dataset ? computeAvailabilityFromDataset(dataset) : null),
    [dataset],
  );
  const matcher = useMemo(() => (dataset ? matcherReadinessFromDataset(dataset) : null), [dataset]);
  const profileComparison = useMemo(
    () => (dataset ? computeProfileComparisonFromDataset(dataset) : null),
    [dataset],
  );
  const nearThreshold = useMemo(
    () => (dataset ? computeNearThresholdFromDataset(dataset) : null),
    [dataset],
  );
  const isEmpty = dataset != null && dataset.rounds.length === 0 && dataset.lockedPredictions.length === 0;

  return (
    <View style={styles.screen} testID="screen-statistics">
      <ScreenHeader
        title="Statistics"
        subtitle="Observed distribution, sequences and recommendation performance."
        icon="chart-bar"
        testID="screen-statistics-title"
        right={<ActionButton label="Refresh" icon="refresh" onPress={reload} testID="statistics-refresh" />}
      />

      {runtime === "web-preview" ? (
        <View style={styles.bannerWrap}>
          <Banner
            tone="info"
            testID="statistics-web-banner"
            text="Web-preview data (AsyncStorage). Native SQLite/DB-002 is the authoritative source."
          />
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center} testID="statistics-loading">
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.muted}>Loading statistics…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error} testID="statistics-error">{error}</Text>
        </View>
      ) : stats ? (
        <>
          {isEmpty ? (
            <View style={styles.bannerWrap}>
              <Banner
                tone="info"
                testID="statistics-empty"
                text="No data yet — add rounds or run a live session to populate statistics."
              />
            </View>
          ) : null}
          <StatsView
            stats={stats}
            footer={
              availability && matcher ? (
                <>
                  <DecisionAvailabilityCard availability={availability} matcher={matcher} />
                  {profileComparison ? <ProfileComparisonCard report={profileComparison} /> : null}
                  {nearThreshold ? (
                    <NearThresholdDiagnosticsCard
                      report={nearThreshold}
                      simulationAvailable={nearThreshold.simulation.available}
                    />
                  ) : null}
                </>
              ) : null
            }
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  bannerWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  muted: { color: colors.textSecondary, fontSize: 13 },
  error: { color: colors.banker, fontSize: 13, paddingHorizontal: spacing.lg, textAlign: "center" },
});
