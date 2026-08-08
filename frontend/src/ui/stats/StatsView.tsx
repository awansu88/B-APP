/**
 * Milestone 6 \u2014 Statistics view. Compact tablet-landscape cards rendering the
 * pure `FullStatistics` report. No engine changes; read-only.
 */
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, Row, SectionLabel, fractionLabel } from '../data/cards';
import { colors, spacing } from '../theme';
import { SessionProfile } from '@/src/domain/session';
import type { FullStatistics, SequenceReport } from '@/src/domain/statistics';

const CATEGORY_LABEL: Record<string, string> = {
  EXPERIMENTAL: 'Experimental',
  QUALIFIED: 'Qualified',
  HIGH_RECOMMENDATION: 'High',
};

const PROFILE_LABEL: Record<SessionProfile, string> = {
  [SessionProfile.EXPERIMENTAL_PLUS]: 'Exp+',
  [SessionProfile.QUALIFIED_PLUS]: 'Qual+',
  [SessionProfile.HIGH_ONLY]: 'High',
};

const PROFILE_ORDER: readonly SessionProfile[] = [
  SessionProfile.EXPERIMENTAL_PLUS,
  SessionProfile.QUALIFIED_PLUS,
  SessionProfile.HIGH_ONLY,
];

function SequenceCard({ title, report, testID }: { title: string; report: SequenceReport; testID: string }) {
  return (
    <Card title={title} testID={testID}>
      <Row label="Eligible attempts" value={report.eligibleAttempts} />
      <Row label="Win" value={report.win} valueColor={colors.tie} />
      <Row label="Loss" value={report.loss} valueColor={colors.banker} />
      <Row label="Push" value={report.push} />
      <Row label="Observed win rate" value={fractionLabel(report.winRate)} />
      <SectionLabel>Completed 3-win sequences</SectionLabel>
      {PROFILE_ORDER.map((p) => (
        <Row key={`c-${p}`} label={PROFILE_LABEL[p]} value={report.completedByProfile[p]} testID={`${testID}-completed-${p}`} />
      ))}
      <SectionLabel>Failed sequences (chain-breaking loss)</SectionLabel>
      {PROFILE_ORDER.map((p) => (
        <Row key={`f-${p}`} label={PROFILE_LABEL[p]} value={report.failedByProfile[p]} />
      ))}
      <SectionLabel>Fixed paper (1 unit / step)</SectionLabel>
      <Row label="Units staked" value={report.paper.unitsStaked} />
      <Row
        label="Net units"
        value={report.paper.netUnits}
        valueColor={report.paper.netUnits >= 0 ? colors.tie : colors.banker}
      />
    </Card>
  );
}

export function StatsView({ stats }: { stats: FullStatistics }) {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      testID="statistics-content"
    >
      <Text style={styles.disclaimer} testID="statistics-disclaimer">
        Observed historical performance only \u2014 not a next-round probability or guaranteed accuracy.
        Win rate excludes Push / Skipped; invalidated predictions are excluded from valid performance.
      </Text>

      <View style={styles.grid}>
        <Card title="Overall" testID="stats-overall">
          <Row label="Total shoes" value={stats.overall.totalShoes} testID="stat-total-shoes" />
          <Row label="Total rounds" value={stats.overall.totalRounds} testID="stat-total-rounds" />
          <Row label="Player" value={stats.overall.playerCount} valueColor={colors.player} />
          <Row label="Banker" value={stats.overall.bankerCount} valueColor={colors.banker} />
          <Row label="Tie" value={stats.overall.tieCount} valueColor={colors.tie} />
          <Row label="Non-Tie" value={stats.overall.nonTieCount} />
        </Card>

        <Card title="Predictions" testID="stats-predictions">
          <Row label="Total locked" value={stats.predictions.totalLocked} />
          <Row label="Valid" value={stats.predictions.valid} />
          <Row label="Invalidated" value={stats.predictions.invalidated} />
          <SectionLabel>Recommendation</SectionLabel>
          <Row label="BET_PLAYER" value={stats.predictions.betPlayer} valueColor={colors.player} />
          <Row label="BET_BANKER" value={stats.predictions.betBanker} valueColor={colors.banker} />
          <Row label="SKIP" value={stats.predictions.skip} />
        </Card>

        <Card title="Prediction Results" testID="stats-results">
          <Row label="Win" value={stats.results.win} valueColor={colors.tie} />
          <Row label="Loss" value={stats.results.loss} valueColor={colors.banker} />
          <Row label="Push" value={stats.results.push} />
          <Row label="Skipped" value={stats.results.skipped} />
          <Row label="Observed win rate" value={fractionLabel(stats.results.winRate)} testID="stat-win-rate" />
        </Card>

        <Card title="Confidence Categories" testID="stats-categories">
          {stats.categories.map((c) => (
            <View key={c.category} style={styles.catBlock}>
              <SectionLabel>{CATEGORY_LABEL[c.category] ?? c.category}</SectionLabel>
              <Row label="Valid BET" value={c.totalBet} />
              <Row label="W / L / P" value={`${c.win} / ${c.loss} / ${c.push}`} />
              <Row label="Win rate" value={fractionLabel(c.winRate)} />
            </View>
          ))}
        </Card>

        <Card title="Player vs Banker" testID="stats-side">
          <SectionLabel>BET_PLAYER</SectionLabel>
          <Row label="W / L / P" value={`${stats.betPlayer.win} / ${stats.betPlayer.loss} / ${stats.betPlayer.push}`} />
          <Row label="Win rate" value={fractionLabel(stats.betPlayer.winRate)} />
          <SectionLabel>BET_BANKER</SectionLabel>
          <Row label="W / L / P" value={`${stats.betBanker.win} / ${stats.betBanker.loss} / ${stats.betBanker.push}`} />
          <Row label="Win rate" value={fractionLabel(stats.betBanker.winRate)} />
        </Card>

        <SequenceCard title="Engine Sequence (all recommendations)" report={stats.engine} testID="stats-engine" />
        <SequenceCard title="Played Sequence (operator-played)" report={stats.played} testID="stats-played" />

        <Card title="Revision / Invalidated" testID="stats-revisions">
          <Row label="Total revisions" value={stats.revisions.totalRevisions} />
          <Row label="Inserts" value={stats.revisions.inserts} />
          <Row label="Updates" value={stats.revisions.updates} />
          <Row label="Deletes" value={stats.revisions.deletes} />
          <Row label="Invalidated predictions" value={stats.revisions.invalidatedPredictions} />
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  disclaimer: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  catBlock: { gap: 2 },
});
