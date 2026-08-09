/**
 * M7.1 Patch 1 — Decision Availability card (read-only, pure inputs).
 * Renders the BET-availability aggregate + SKIP breakdown + Historical Matcher
 * readiness. Explicit denominators; nothing here is a win probability.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Card, Row, SectionLabel } from '../data/cards';
import { colors, spacing } from '../theme';
import {
  SKIP_REASON_LABEL,
  topSkipReasons,
  type DecisionAvailability,
  type MatcherReadiness,
} from '@/src/domain/observability';

const pct = (n: number | null): string => (n == null ? 'n/a' : `${(n * 100).toFixed(1)}%`);

export function DecisionAvailabilityCard({
  availability,
  matcher,
}: {
  readonly availability: DecisionAvailability;
  readonly matcher: MatcherReadiness;
}) {
  const top = topSkipReasons(availability, 4);
  return (
    <View style={styles.grid}>
      <Card title="Decision Availability" testID="stats-availability">
        <Text style={styles.disclaimer}>
          How often the accepted DECISION-001 engine offered a BET vs SKIP. This is availability,
          not accuracy or a win probability.
        </Text>
        <Row label="Eligible decisions" value={availability.eligible} testID="avail-eligible" />
        <Row label="Official BET" value={availability.bet} valueColor={colors.tie} testID="avail-bet" />
        <Row label="Official SKIP" value={availability.skip} testID="avail-skip" />
        <Row
          label="BET availability"
          value={`${availability.bet} / ${availability.eligible}  (${pct(availability.betRate)})`}
          testID="avail-bet-rate"
        />
        <Row label="SKIP rate" value={pct(availability.skipRate)} testID="avail-skip-rate" />
        <SectionLabel>Directional lean on SKIPs</SectionLabel>
        <Row label="Player / Banker / None" value={`${availability.leanPlayer} / ${availability.leanBanker} / ${availability.leanNone}`} testID="avail-lean" />
      </Card>

      <Card title="Top SKIP Reasons" testID="stats-skip-reasons">
        {top.length === 0 ? (
          <Text style={styles.muted} testID="skip-reasons-empty">No SKIPs recorded.</Text>
        ) : (
          top.map((e) => (
            <Row key={e.reason} label={SKIP_REASON_LABEL[e.reason]} value={e.count} testID={`skip-reason-${e.reason}`} />
          ))
        )}
        {availability.traceUnavailable > 0 ? (
          <Text style={styles.muted} testID="skip-trace-note">
            {availability.traceUnavailable} SKIP(s) had no stored trace — reason NOT AVAILABLE
            (historical payload predates trace capture; not regenerated).
          </Text>
        ) : null}
      </Card>

      <Card title="Historical Matcher" testID="stats-matcher">
        <Row label="Collection" value="ACTIVE" testID="stats-matcher-collection" />
        <Row label="Completed Shoes" value={`${matcher.completedShoes} / ${matcher.requiredShoes}`} testID="stats-matcher-shoes" />
        <Row
          label="Non-Tie Rounds"
          value={`${matcher.nonTieRounds.toLocaleString()} / ${matcher.requiredNonTieRounds.toLocaleString()}`}
          testID="stats-matcher-rounds"
        />
        <Row
          label="Eligibility"
          value={matcher.eligibility}
          valueColor={matcher.eligibility === 'ELIGIBLE' ? colors.tie : colors.textSecondary}
          testID="stats-matcher-eligibility"
        />
        <Row label="Voting" value="DISABLED — PATCH 3" valueColor={colors.textMuted} testID="stats-matcher-voting" />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  disclaimer: { color: colors.textMuted, fontSize: 11, marginBottom: spacing.xs, lineHeight: 15 },
  muted: { color: colors.textMuted, fontSize: 11, marginTop: spacing.xs, lineHeight: 15 },
});
