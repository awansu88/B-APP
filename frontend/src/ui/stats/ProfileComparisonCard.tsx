/**
 * M7.1 Patch 2 — Profile Comparison card (read-only, pure inputs).
 *
 * Compares STRICT (DECISION-001) vs BALANCED (DECISION-003) over the IMMUTABLE
 * pre-result comparison telemetry stored in Patch-2 LockedPredictions. Reports
 * availability (BET/SKIP/side) and observed W/L/P (WIN/(WIN+LOSS), PUSH &
 * INVALIDATED excluded). Everything here is availability/observed telemetry —
 * never a future win probability. Pre-Patch-2 records are reported as
 * NOT_AVAILABLE and excluded from the per-profile denominators.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Card, Row, SectionLabel } from '../data/cards';
import { colors, spacing } from '../theme';
import type { ProfileAvailability, ProfileComparisonReport } from '@/src/domain/observability';

const pct = (n: number | null): string => (n == null ? 'n/a' : `${(n * 100).toFixed(1)}%`);

function ProfileColumn({
  title,
  version,
  data,
  testID,
}: {
  readonly title: string;
  readonly version: string;
  readonly data: ProfileAvailability;
  readonly testID: string;
}) {
  const a = data.availability;
  const o = data.observed;
  return (
    <Card title={title} testID={testID}>
      <Text style={styles.version}>{version}</Text>
      <SectionLabel>Availability</SectionLabel>
      <Row label="Eligible" value={a.eligible} testID={`${testID}-eligible`} />
      <Row label="BET" value={a.bet} valueColor={colors.tie} testID={`${testID}-bet`} />
      <Row label="SKIP" value={a.skip} testID={`${testID}-skip`} />
      <Row
        label="BET availability"
        value={`${a.bet} / ${a.eligible}  (${pct(a.betRate)})`}
        testID={`${testID}-bet-rate`}
      />
      <Row
        label="Player / Banker rec"
        value={`${a.betPlayer} / ${a.betBanker}`}
        testID={`${testID}-side`}
      />
      <SectionLabel>Observed (W / L / P)</SectionLabel>
      <Row
        label="Win / Loss / Push"
        value={`${o.win} / ${o.loss} / ${o.push}`}
        testID={`${testID}-wlp`}
      />
      <Row
        label="Win rate = W/(W+L)"
        value={pct(o.winRate)}
        testID={`${testID}-winrate`}
      />
    </Card>
  );
}

export function ProfileComparisonCard({ report }: { readonly report: ProfileComparisonReport }) {
  if (report.available === 0) {
    return (
      <View style={styles.grid}>
        <Card title="Profile Comparison (STRICT vs BALANCED)" testID="stats-profile-comparison">
          <Text style={styles.muted} testID="profile-comparison-na">
            NOT_AVAILABLE — no Patch-2 comparison telemetry yet.
            {report.notAvailable > 0
              ? ` ${report.notAvailable} pre-Patch-2 record(s) excluded (not regenerated).`
              : ''}
          </Text>
        </Card>
      </View>
    );
  }
  return (
    <View style={styles.grid} testID="stats-profile-comparison">
      <ProfileColumn
        title="STRICT"
        version="DECISION-001 · Accepted"
        data={report.strict}
        testID="profile-strict"
      />
      <ProfileColumn
        title="PRODUCTION (BALANCED)"
        version="DECISION-003 · Derived Road + Matcher"
        data={report.balanced}
        testID="profile-balanced"
      />
      <Card title="Comparison Coverage" testID="stats-profile-coverage">
        <Text style={styles.muted}>
          Availability & observed telemetry only — not a future win probability. PUSH and INVALIDATED
          excluded from the win-rate denominator.
        </Text>
        <Row label="With comparison data" value={report.available} testID="profile-available" />
        <Row
          label="NOT_AVAILABLE (pre-Patch-2)"
          value={report.notAvailable}
          valueColor={colors.textMuted}
          testID="profile-not-available"
        />
        <Row
          label="Official: STRICT / BALANCED"
          value={`${report.selectedStrict} / ${report.selectedBalanced}`}
          testID="profile-selected-counts"
        />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  version: { color: colors.textMuted, fontSize: 11, marginBottom: spacing.xs },
  muted: { color: colors.textMuted, fontSize: 11, marginTop: spacing.xs, lineHeight: 15 },
});
