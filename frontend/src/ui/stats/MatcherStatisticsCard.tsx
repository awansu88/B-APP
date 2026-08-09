/**
 * M7.1 Patch 3 Stage B2 — Historical Matcher statistics card.
 *
 * Restrained, read-only presentation of the pure Stage-B1 matcher-audit
 * aggregation (MatcherStatsReport) plus corpus readiness. It NEVER recomputes
 * matcher history: pre-Patch-3 locks are surfaced as explicit NOT_AVAILABLE
 * coverage (never silently dropped). Similarity / effective-matches summaries
 * are descriptive quality scores — never win probabilities.
 */
import { StyleSheet, Text } from 'react-native';

import { Card, Row, SectionLabel } from '../data/cards';
import { colors } from '../theme';
import {
  buildMatcherSettingsView,
  matcherAbstainDistribution,
  matcherCoverageLabel,
  type MatcherReadiness,
  type MatcherStatsReport,
} from '@/src/domain/observability';

export function MatcherStatisticsCard({
  report,
  readiness,
}: {
  report: MatcherStatsReport;
  readiness: MatcherReadiness;
}) {
  const corpus = buildMatcherSettingsView(readiness);
  const distribution = matcherAbstainDistribution(report);

  return (
    <Card title="Historical Matcher" testID="stats-matcher" wide>
      <SectionLabel>Corpus</SectionLabel>
      <Row label="Completed Shoes" value={corpus.completedShoesLabel} testID="stats-matcher-shoes" />
      <Row label="Non-Tie Rounds" value={corpus.nonTieRoundsLabel} testID="stats-matcher-rounds" />
      <Row
        label="Eligibility"
        value={corpus.eligibility}
        valueColor={corpus.eligible ? colors.tie : colors.textSecondary}
        testID="stats-matcher-eligibility"
      />

      <SectionLabel>Audit Coverage</SectionLabel>
      <Row label="matcherAudit available" value={report.withAudit} testID="stats-matcher-with-audit" />
      <Row label="NOT_AVAILABLE (pre-Patch-3)" value={report.withoutAudit} testID="stats-matcher-without-audit" />
      <Row label="Coverage" value={matcherCoverageLabel(report)} testID="stats-matcher-coverage" />

      <SectionLabel>Signals</SectionLabel>
      <Row label="Matcher Evaluations" value={report.eligibleEvaluations} testID="stats-matcher-evaluations" />
      <Row label="PLAYER Signals" value={report.playerSignals} valueColor={colors.player} testID="stats-matcher-player" />
      <Row label="BANKER Signals" value={report.bankerSignals} valueColor={colors.banker} testID="stats-matcher-banker" />
      <Row label="ABSTAIN" value={report.abstain} testID="stats-matcher-abstain" />
      <Row label="COLLECTING / Ineligible" value={report.collecting} testID="stats-matcher-collecting" />

      {distribution.length > 0 ? (
        <>
          <SectionLabel>Abstain Reasons</SectionLabel>
          {distribution.map((d) => (
            <Row key={d.reason} label={d.label} value={d.count} testID={`stats-matcher-reason-${d.reason}`} />
          ))}
        </>
      ) : null}

      <SectionLabel>Quality (descriptive)</SectionLabel>
      <Row
        label="Mean Effective Matches"
        value={report.meanEffectiveMatches == null ? '—' : report.meanEffectiveMatches.toFixed(2)}
        testID="stats-matcher-mean-effective"
      />
      <Row
        label="Mean Top Similarity"
        value={report.meanTopSimilarity == null ? '—' : report.meanTopSimilarity.toFixed(2)}
        testID="stats-matcher-mean-similarity"
      />
      <Text style={styles.note} testID="stats-matcher-note">
        Observed matcher audit only — similarity, effective-matches and strength are decision-quality
        scores, not next-round win probabilities. Pre-Patch-3 predictions have no matcherAudit and are
        counted as NOT_AVAILABLE, never dropped.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  note: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 8 },
});
