/**
 * M7.1 Patch 4 — Threshold Lab statistics card (Statistics screen).
 *
 * FORWARD OBSERVED DECISION-004 / BALCFG-001 experiment data, segmented by the
 * per-shoe Balanced threshold. Explicitly labeled and kept separate from the
 * Patch-2.1 retrospective simulation (different denominators). Pre-Patch-4 locks
 * (no BALCFG-001) are shown as NOT_AVAILABLE coverage, never bucketed.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Card, Row, SectionLabel, fractionLabel } from '../data/cards';
import { colors, spacing } from '../theme';
import type { ThresholdLabReport } from '@/src/domain/observability';

export function ThresholdLabCard({ report }: { report: ThresholdLabReport }) {
  return (
    <Card title="Threshold Lab — Forward Observed Data" testID="stats-threshold-lab" wide>
      <View style={styles.tag}>
        <Text style={styles.tagText}>FORWARD OBSERVED · DECISION-004 / BALCFG-001</Text>
      </View>

      <SectionLabel>Coverage</SectionLabel>
      <Row
        label="DECISION-004 predictions"
        value={report.withBalcfg}
        testID="threshold-lab-with"
      />
      <Row
        label="NOT_AVAILABLE (pre-Patch-4)"
        value={report.withoutBalcfg}
        testID="threshold-lab-without"
      />
      <Row
        label="Coverage"
        value={`${report.withBalcfg} / ${report.totalValid} predictions`}
        testID="threshold-lab-coverage"
      />

      {report.buckets.map((b) => {
        const hasData = b.eligibleDecisions > 0;
        return (
          <View key={b.threshold} testID={`threshold-bucket-${b.threshold.toFixed(2)}`}>
            <SectionLabel>Threshold {b.threshold.toFixed(2)}</SectionLabel>
            {hasData ? (
              <>
                <Row label="Shoes represented" value={b.shoes} />
                <Row label="Eligible decisions" value={b.eligibleDecisions} />
                <Row label="BET" value={b.bet} />
                <Row label="SKIP" value={b.skip} />
                <Row label="BET availability" value={fractionLabel(b.betAvailability)} />
                <Row label="PLAYER recommendations" value={b.playerRecs} valueColor={colors.player} />
                <Row label="BANKER recommendations" value={b.bankerRecs} valueColor={colors.banker} />
                <Row label="Observed official BETs" value={b.officialBets} />
                <Row label="W / L / P" value={`${b.win} / ${b.loss} / ${b.push}`} />
                <Row label="Observed win rate" value={fractionLabel(b.winRate)} />
              </>
            ) : (
              <Text style={styles.empty}>No forward data at this threshold yet.</Text>
            )}
          </View>
        );
      })}

      <Text style={styles.note} testID="stats-threshold-lab-note">
        Forward experiment data only. Predictions from different thresholds are never combined into a
        single result. This is distinct from the informational/retrospective Near-Threshold Simulation
        below — the two use different denominators. Observed win rate uses the accepted
        WIN / (WIN + LOSS) rule and counts only rounds where BALANCED was the official/played profile.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: spacing.sm,
  },
  tagText: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  empty: { color: colors.textMuted, fontSize: 12, paddingVertical: 2 },
  note: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 8 },
});
