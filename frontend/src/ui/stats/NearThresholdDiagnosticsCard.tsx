/**
 * M7.1 Patch 2.1 — Near-Threshold Diagnostics card (read-only, pure inputs).
 *
 * OBSERVABILITY ONLY. Renders, over IMMUTABLE stored decision trace:
 *   - Near-Threshold Diagnostics (analyzable / unavailable SKIPs, 0.52–<0.55
 *     count + %, THRESHOLD_ONLY vs OTHER_GATE vs NOT_AVAILABLE),
 *   - the exact confidence distribution (buckets A–F),
 *   - Near-Threshold SKIP Reasons,
 *   - the INFORMATIONAL BALANCED Threshold Simulation (0.55 / 0.54 / 0.53 / 0.52),
 *   - STRICT / BALANCED comparison coverage.
 *
 * There are NO threshold controls here. Production threshold stays 0.55 FIXED
 * for both profiles. Nothing here is a recommendation, retroactive engine output
 * or win probability.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Card, Row, SectionLabel } from '../data/cards';
import { colors, spacing } from '../theme';
import {
  CONFIDENCE_BUCKET_LABEL,
  CONFIDENCE_BUCKET_ORDER,
  SKIP_REASON_LABEL,
  SkipReason,
  type NearThresholdDatasetReport,
  type NearThresholdReport,
  type ThresholdSimulationReport,
} from '@/src/domain/observability';

const pct = (n: number | null): string => (n == null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
const t = (n: number): string => n.toFixed(2);

function nearThresholdReasonRows(report: NearThresholdReport) {
  return (Object.keys(report.nearThresholdReasons) as SkipReason[])
    .map((reason) => ({ reason, count: report.nearThresholdReasons[reason] }))
    .filter((e) => e.count > 0);
}

function SimulationCard({
  report,
  title,
  testID,
}: {
  readonly report: ThresholdSimulationReport;
  readonly title: string;
  readonly testID: string;
}) {
  return (
    <Card title={title} testID={testID}>
      <Text style={styles.disclaimer}>
        INFORMATIONAL ONLY — not a recommendation, not retroactive engine output, not a win
        probability. Production threshold stays 0.55 FIXED.
      </Text>
      {report.results.map((r) => (
        <Row
          key={r.threshold}
          label={`Threshold ${t(r.threshold)} · potential BET`}
          value={`${r.totalPotentialBet} / ${r.denominator}  (${pct(r.potentialBetRate)})`}
          valueColor={r.threshold === 0.55 ? colors.textSecondary : colors.tie}
          testID={`${testID}-${t(r.threshold)}`}
        />
      ))}
      <Text style={styles.muted}>
        “+bet” at a lower threshold counts ONLY proven THRESHOLD_ONLY SKIPs whose stored confidence
        {' '}&gt;= the threshold. At 0.55 the potential equals the actual official BET availability.
      </Text>
    </Card>
  );
}

export function NearThresholdDiagnosticsCard({
  report,
  simulationAvailable,
}: {
  readonly report: NearThresholdDatasetReport;
  /** SAFE_THRESHOLD_SIMULATION flag (immutable-trace sufficiency). */
  readonly simulationAvailable: boolean;
}) {
  const o = report.official;
  const c = o.classification;
  const reasonRows = nearThresholdReasonRows(o);

  return (
    <View style={styles.grid} testID="stats-near-threshold">
      <Card title="Near-Threshold Diagnostics" testID="near-threshold-summary">
        <Text style={styles.disclaimer}>
          Diagnostics over the accepted immutable SKIP trace. Near-threshold means a stored SKIP
          with confidence 0.52 &lt;= c &lt; 0.55. Availability diagnostics — not accuracy or a win
          probability.
        </Text>
        <Row label="Eligible decisions" value={o.eligible} testID="near-eligible" />
        <Row label="Official BET" value={o.officialBet} valueColor={colors.tie} testID="near-bet" />
        <Row label="Official SKIP" value={o.officialSkip} testID="near-skip" />
        <Row label="Analyzable SKIPs" value={o.analyzableSkip} testID="near-analyzable" />
        <Row
          label="Unavailable SKIPs (NOT_AVAILABLE)"
          value={o.unavailableSkip}
          valueColor={colors.textMuted}
          testID="near-unavailable"
        />
        <SectionLabel>Near-threshold 0.52–&lt;0.55</SectionLabel>
        <Row
          label="Near-threshold SKIPs"
          value={`${o.nearThresholdSkip} / ${o.analyzableSkip}  (${pct(o.nearThresholdPct)})`}
          valueColor={colors.tie}
          testID="near-count"
        />
        <SectionLabel>Threshold-only classification (analyzable SKIPs)</SectionLabel>
        <Row label="THRESHOLD_ONLY" value={c.thresholdOnly} valueColor={colors.tie} testID="near-threshold-only" />
        <Row label="OTHER_GATE" value={c.otherGate} testID="near-other-gate" />
        <Row label="NOT_AVAILABLE (trace)" value={c.notAvailable} valueColor={colors.textMuted} testID="near-not-available" />
      </Card>

      <Card title="SKIP Confidence Distribution" testID="near-distribution">
        <Text style={styles.disclaimer}>
          Exact numeric buckets over analyzable SKIPs (stored SKIP confidence is capped at 0.54 by
          the accepted below-threshold ceiling).
        </Text>
        {CONFIDENCE_BUCKET_ORDER.map((bucket) => (
          <Row
            key={bucket}
            label={CONFIDENCE_BUCKET_LABEL[bucket]}
            value={o.distribution[bucket]}
            testID={`near-bucket-${bucket}`}
          />
        ))}
      </Card>

      <Card title="Near-Threshold SKIP Reasons" testID="near-reasons">
        <Text style={styles.disclaimer}>
          Primary accepted-pipeline reason for SKIPs in the 0.52–&lt;0.55 window.
        </Text>
        {reasonRows.length === 0 ? (
          <Text style={styles.muted} testID="near-reasons-empty">
            No near-threshold SKIPs recorded.
          </Text>
        ) : (
          reasonRows.map((e) => (
            <Row
              key={e.reason}
              label={SKIP_REASON_LABEL[e.reason]}
              value={e.count}
              testID={`near-reason-${e.reason}`}
            />
          ))
        )}
      </Card>

      {simulationAvailable ? (
        <SimulationCard
          report={report.simulation}
          title="Balanced Threshold Simulation"
          testID="near-simulation"
        />
      ) : (
        <Card title="Balanced Threshold Simulation" testID="near-simulation-unavailable">
          <Text style={styles.muted}>
            SAFE_THRESHOLD_SIMULATION = NO — immutable trace insufficient to prove threshold-only
            availability. Diagnostics shown above only.
          </Text>
        </Card>
      )}

      <Card title="STRICT / BALANCED Coverage" testID="near-coverage">
        <Text style={styles.disclaimer}>
          Per-profile diagnostics from immutable PROFILECMP-001 snapshots. Pre-PROFILECMP records
          are NOT_AVAILABLE (never regenerated).
        </Text>
        <Row
          label="Comparison coverage"
          value={`${report.comparisonCoverage.withComparison} / ${report.comparisonCoverage.total}`}
          testID="near-cmp-coverage"
        />
        <Row
          label="NOT_AVAILABLE (pre-PROFILECMP)"
          value={report.comparisonCoverage.withoutComparison}
          valueColor={colors.textMuted}
          testID="near-cmp-na"
        />
        <SectionLabel>STRICT (DECISION-001) analyzable SKIPs</SectionLabel>
        <Row
          label="Analyzable / near-threshold"
          value={`${report.strict.analyzableSkip} / ${report.strict.nearThresholdSkip}`}
          testID="near-strict"
        />
        <SectionLabel>BALANCED (DECISION-002) analyzable SKIPs</SectionLabel>
        <Row
          label="Analyzable / near-threshold"
          value={`${report.balanced.analyzableSkip} / ${report.balanced.nearThresholdSkip}`}
          testID="near-balanced"
        />
      </Card>

      <Card title="Future Balanced Threshold Lab" testID="near-future-note">
        <Banner
          tone="info"
          testID="near-future-presets"
          text="Future BALANCED Experimental presets: 0.52 / 0.53 / 0.54 / 0.55. Selectable per shoe, locked for the current shoe, stored immutably with each prediction — NOT IMPLEMENTED YET (no controls in this patch)."
        />
        <Text style={styles.muted}>
          Historical Matcher remains NO VOTE for this patch only; multi-road Historical Matcher is a
          later Patch 3.
        </Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  disclaimer: { color: colors.textMuted, fontSize: 11, marginBottom: spacing.xs, lineHeight: 15 },
  muted: { color: colors.textMuted, fontSize: 11, marginTop: spacing.xs, lineHeight: 15 },
});
