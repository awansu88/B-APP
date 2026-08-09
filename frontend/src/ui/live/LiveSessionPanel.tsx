/**
 * LiveSessionPanel — additive Milestone-5C panel for the Active Shoe screen.
 * Renders ONLY accepted domain/store state (no sequence/evaluation logic here):
 * the persisted LockedPrediction, confidence (an evidence/decision score — never
 * a win probability), category, active risk reason codes, engine vs played
 * three-win progress, fixed-unit paper metrics, the PLAYED/NOT_PLAYED operator
 * control, and the last resolved outcome.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PredictionCategory, PredictionDecision } from '@/src/domain/models/enums';
import {
  buildMatcherLiveView,
  deriveSkipDiagnostic,
  LeanSide,
  lockToTrace,
  SKIP_REASON_LABEL,
  type MatcherLiveState,
} from '@/src/domain/observability';
import { usePreferences } from '@/src/workflows/preferences';
import {
  OperatorAction,
  SessionEnvironment,
  SessionProfile,
  StepResult,
  type PredictionEntry,
  type SequenceState,
  type SessionState,
} from '@/src/domain/session';
import { colors, radius, spacing } from '@/src/ui/theme';

interface Props {
  readonly state: SessionState;
  readonly lastResolved: PredictionEntry | null;
  readonly operatorAction: OperatorAction;
  readonly onSetOperatorAction: (action: OperatorAction) => void;
  readonly busy: boolean;
  readonly storeKind: 'sqlite' | 'memory' | null;
}

const DECISION_LABEL: Record<PredictionDecision, string> = {
  [PredictionDecision.BET_PLAYER]: 'BET PLAYER',
  [PredictionDecision.BET_BANKER]: 'BET BANKER',
  [PredictionDecision.SKIP]: 'SKIP',
};

const decisionColor = (d: PredictionDecision): string =>
  d === PredictionDecision.BET_PLAYER
    ? colors.player
    : d === PredictionDecision.BET_BANKER
      ? colors.banker
      : colors.textMuted;

const CATEGORY_LABEL: Record<PredictionCategory, string> = {
  [PredictionCategory.EXPERIMENTAL]: 'EXPERIMENTAL',
  [PredictionCategory.QUALIFIED]: 'QUALIFIED',
  [PredictionCategory.HIGH_RECOMMENDATION]: 'HIGH',
  [PredictionCategory.BELOW_THRESHOLD]: 'BELOW THRESHOLD',
};

const RESULT_LABEL: Record<StepResult, string> = {
  [StepResult.PENDING]: 'PENDING',
  [StepResult.WIN]: 'WIN',
  [StepResult.LOSS]: 'LOSS',
  [StepResult.PUSH]: 'PUSH',
  [StepResult.SKIPPED]: 'SKIPPED',
  [StepResult.INVALIDATED]: 'INVALIDATED',
};

const resultColor = (r: StepResult): string => {
  switch (r) {
    case StepResult.WIN:
      return colors.tie;
    case StepResult.LOSS:
      return colors.banker;
    case StepResult.PUSH:
      return colors.accent;
    default:
      return colors.textSecondary;
  }
};

const progressLabel = (seq: SequenceState): string =>
  seq.achieved ? 'COMPLETE' : `${seq.consecutiveWins} / 3`;

const leanColor = (side: LeanSide): string =>
  side === LeanSide.PLAYER
    ? colors.player
    : side === LeanSide.BANKER
      ? colors.banker
      : colors.textMuted;

const matcherStateColor = (s: MatcherLiveState): string => {
  switch (s) {
    case 'ACTIVE':
      return colors.tie;
    case 'COLLECTING':
      return colors.accent;
    case 'ELIGIBLE_ABSTAIN':
      return colors.textSecondary;
    default:
      return colors.textMuted;
  }
};

const matcherSignalColor = (sig: 'PLAYER' | 'BANKER' | null): string =>
  sig === 'PLAYER' ? colors.player : sig === 'BANKER' ? colors.banker : colors.textMuted;

export function LiveSessionPanel({
  state,
  lastResolved,
  operatorAction,
  onSetOperatorAction,
  busy,
  storeKind,
}: Props) {
  const prefs = usePreferences();
  const [matcherExpanded, setMatcherExpanded] = useState(false);
  const prediction = state.currentPrediction;
  const envLabel =
    state.environment === SessionEnvironment.HISTORICAL_TEST ? 'HISTORICAL TEST' : 'LIVE FORWARD';
  const engine = state.sequences.engine[SessionProfile.EXPERIMENTAL_PLUS];
  const played = state.sequences.played[SessionProfile.EXPERIMENTAL_PLUS];

  if (!prediction) {
    return (
      <View style={styles.card} testID="live-panel-locked-missing">
        <Text style={styles.envLabel}>{envLabel}</Text>
        <Text style={styles.errorText}>No active lock. Enable input once a prediction is locked.</Text>
      </View>
    );
  }

  const isSkip = prediction.decision === PredictionDecision.SKIP;
  const diag = deriveSkipDiagnostic(lockToTrace(prediction));
  const matcherView = buildMatcherLiveView(prediction.matcherAudit, prefs.engineMode);

  return (
    <View style={styles.card} testID="live-panel">
      <View style={styles.headerRow}>
        <Text style={styles.envLabel}>{envLabel}</Text>
        <Text style={styles.targetLabel} testID="live-target">
          TARGET {prediction.targetRound}
        </Text>
        <View style={styles.lockedBadge}>
          <Text style={styles.lockedText}>LOCKED</Text>
        </View>
        <Text style={styles.storeKind}>{storeKind === 'sqlite' ? 'SQLite/DB-002' : 'AsyncStorage'}</Text>
      </View>

      <View style={styles.modeRow} testID="live-engine-mode">
        <Text style={styles.sectionLabel}>Engine Mode</Text>
        <Text
          style={[styles.modeValue, prefs.engineMode === 'BALANCED' ? styles.modeBalanced : styles.modeStrict]}
          testID="live-engine-mode-value"
        >
          {prefs.engineMode === 'BALANCED' ? 'BALANCED — EXPERIMENTAL' : 'STRICT'}
        </Text>
        {prefs.engineMode === 'BALANCED' && typeof prediction.balancedThreshold === 'number' ? (
          <Text style={styles.thresholdBadge} testID="live-threshold">
            Threshold {prediction.balancedThreshold.toFixed(2)} LOCKED
          </Text>
        ) : null}
      </View>

      <View style={styles.recommendRow}>
        <View style={[styles.decisionChip, { borderColor: decisionColor(prediction.decision) }]}>
          <Text
            style={[styles.decisionText, { color: decisionColor(prediction.decision) }]}
            testID="live-decision"
          >
            {DECISION_LABEL[prediction.decision]}
          </Text>
        </View>
        <View style={styles.scoreCol}>
          <Text style={styles.scoreLabel}>Confidence score</Text>
          <Text style={styles.scoreValue} testID="live-confidence">
            {prediction.confidence.toFixed(2)}
          </Text>
        </View>
        <View style={styles.catChip}>
          <Text style={styles.catText} testID="live-category">
            {CATEGORY_LABEL[prediction.category]}
          </Text>
        </View>
      </View>

      {prediction.riskFlags.length > 0 ? (
        <Text style={styles.riskText} testID="live-risk">
          Risk: {prediction.riskFlags.join(', ')}
        </Text>
      ) : null}

      {isSkip && prefs.showDirectionalLean ? (
        <View style={styles.skipInfo} testID="live-skip-info">
          <View style={styles.leanRow}>
            <Text style={styles.sectionLabel}>Directional Lean</Text>
            <Text style={[styles.leanValue, { color: leanColor(diag.lean.side) }]} testID="live-lean">
              {diag.lean.side}
            </Text>
            <View style={styles.infoTag}>
              <Text style={styles.infoTagText}>INFORMATIONAL</Text>
            </View>
            {diag.lean.hasEvidence && diag.lean.evidenceShare != null ? (
              <Text style={styles.leanShare} testID="live-lean-evidence">
                Evidence {(diag.lean.evidenceShare * 100).toFixed(0)}%
              </Text>
            ) : null}
          </View>
          <Text style={styles.whySkip} testID="live-why-skip">
            Why Skip: {diag.primaryReason ? SKIP_REASON_LABEL[diag.primaryReason] : '—'}
          </Text>
          <Text style={styles.nonActionable}>
            Lean is non-actionable — the official recommendation is SKIP.
          </Text>
        </View>
      ) : null}

      {/* Operator action (attempt tracking); immutable to the locked prediction. */}
      <View style={styles.actionRow}>
        <Text style={styles.sectionLabel}>Operator</Text>
        <Pressable
          testID="op-played"
          disabled={isSkip || busy}
          onPress={() => onSetOperatorAction(OperatorAction.PLAYED)}
          style={[
            styles.segment,
            operatorAction === OperatorAction.PLAYED && !isSkip ? styles.segmentActive : null,
            isSkip ? styles.segmentDisabled : null,
          ]}
        >
          <Text style={styles.segmentText}>PLAYED</Text>
        </Pressable>
        <Pressable
          testID="op-not-played"
          disabled={busy}
          onPress={() => onSetOperatorAction(OperatorAction.NOT_PLAYED)}
          style={[
            styles.segment,
            operatorAction === OperatorAction.NOT_PLAYED || isSkip ? styles.segmentActive : null,
          ]}
        >
          <Text style={styles.segmentText}>NOT PLAYED</Text>
        </Pressable>
      </View>

      <View style={styles.progressRow}>
        <View style={styles.progressCell}>
          <Text style={styles.sectionLabel}>Engine</Text>
          <Text style={styles.progressValue} testID="engine-progress">
            {progressLabel(engine)}
          </Text>
        </View>
        <View style={styles.progressCell}>
          <Text style={styles.sectionLabel}>Played</Text>
          <Text style={styles.progressValue} testID="played-progress">
            {progressLabel(played)}
          </Text>
        </View>
        <View style={styles.progressCell}>
          <Text style={styles.sectionLabel}>Paper (units)</Text>
          <Text style={styles.progressValue} testID="paper-metrics">
            {state.paper.netUnits >= 0 ? '+' : ''}
            {state.paper.netUnits} · {state.paper.wins}W {state.paper.losses}L {state.paper.pushes}P
          </Text>
        </View>
      </View>

      {lastResolved ? (
        <View style={styles.feedbackRow} testID="live-last-result">
          <Text style={styles.sectionLabel}>Last (target {lastResolved.prediction.targetRound})</Text>
          <Text style={[styles.feedbackValue, { color: resultColor(lastResolved.result) }]}>
            {RESULT_LABEL[lastResolved.result]}
          </Text>
        </View>
      ) : null}

      {matcherView.available ? (
        <View style={styles.matcher} testID="live-matcher">
          <View style={styles.matcherHeader}>
            <Text style={styles.sectionLabel}>Historical Matcher</Text>
            <View style={[styles.matcherStateTag, { borderColor: matcherStateColor(matcherView.state) }]}>
              <Text
                style={[styles.matcherStateText, { color: matcherStateColor(matcherView.state) }]}
                testID="live-matcher-state"
              >
                {matcherView.stateLabel}
              </Text>
            </View>
            {matcherView.signal ? (
              <Text
                style={[styles.matcherSignal, { color: matcherSignalColor(matcherView.signal) }]}
                testID="live-matcher-signal"
              >
                {matcherView.signal}
              </Text>
            ) : null}
          </View>

          {matcherView.state === 'COLLECTING' ? (
            <View style={styles.matcherLine}>
              <Text style={styles.matcherMeta}>Completed Shoes {matcherView.shoesLabel}</Text>
              <Text style={styles.matcherMeta}>Non-Tie {matcherView.roundsLabel}</Text>
              <Text style={styles.matcherMeta}>{matcherView.votingLabel}</Text>
            </View>
          ) : null}

          {matcherView.state === 'ELIGIBLE_ABSTAIN' ? (
            <Text style={styles.matcherMeta} testID="live-matcher-abstain">
              Reason: {matcherView.abstainReasonLabel}
            </Text>
          ) : null}

          {matcherView.state === 'ACTIVE' ? (
            <View style={styles.matcherLine}>
              <Text style={styles.matcherMeta}>Evidence {matcherView.evidenceLabel}</Text>
              <Text style={styles.matcherMeta}>Effective Matches {matcherView.effectiveMatches}</Text>
            </View>
          ) : null}

          {matcherView.contextLabel ? (
            <View style={styles.matcherContextRow}>
              <View style={styles.infoTag}>
                <Text style={styles.infoTagText}>SECONDARY</Text>
              </View>
              <Text style={styles.matcherContext} testID="live-matcher-context">
                {matcherView.contextLabel}
              </Text>
            </View>
          ) : null}

          {matcherView.details.length > 0 ? (
            <>
              <Pressable
                testID="live-matcher-details-toggle"
                onPress={() => setMatcherExpanded((v) => !v)}
                style={styles.matcherToggle}
              >
                <Text style={styles.matcherToggleText}>
                  {matcherExpanded ? '▾ Hide matcher details' : '▸ Matcher details'}
                </Text>
              </Pressable>
              {matcherExpanded ? (
                <View style={styles.matcherDetails} testID="live-matcher-details">
                  {matcherView.details.map((d) => (
                    <View key={d.label} style={styles.matcherDetailRow}>
                      <Text style={styles.matcherDetailKey}>{d.label}</Text>
                      <Text style={styles.matcherDetailVal}>{d.value}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}

      {prefs.showDecisionComparison && prediction.profileComparison ? (
        <View style={styles.details} testID="live-comparison">
          <Text style={styles.sectionLabel}>Profile Comparison (secondary)</Text>
          <View style={styles.cmpRow}>
            <Text
              style={[styles.cmpProfile, prediction.profileComparison.selectedProfile === 'STRICT' ? styles.cmpSelected : null]}
              testID="live-cmp-strict"
            >
              STRICT: {prediction.profileComparison.strict.decision === 'SKIP'
                ? 'SKIP'
                : `${prediction.profileComparison.strict.decision.replace('BET_', 'BET ')}`}{' '}
              {prediction.profileComparison.strict.confidence.toFixed(2)}
            </Text>
            <Text
              style={[styles.cmpProfile, prediction.profileComparison.selectedProfile === 'BALANCED' ? styles.cmpSelected : null]}
              testID="live-cmp-balanced"
            >
              BALANCED: {prediction.profileComparison.balanced.decision === 'SKIP'
                ? 'SKIP'
                : `${prediction.profileComparison.balanced.decision.replace('BET_', 'BET ')}`}{' '}
              {prediction.profileComparison.balanced.confidence.toFixed(2)}
            </Text>
          </View>
          <Text style={styles.traceText}>
            Comparison is control telemetry — only {prediction.profileComparison.selectedProfile} is actionable.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  envLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  targetLabel: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  lockedBadge: {
    backgroundColor: colors.railActiveSurface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  lockedText: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  storeKind: { color: colors.textMuted, fontSize: 10, marginLeft: 'auto' },
  recommendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  modeValue: { fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  modeStrict: { color: colors.textSecondary },
  modeBalanced: { color: colors.tie },
  cmpRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  cmpProfile: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  cmpSelected: { color: colors.textPrimary },
  decisionChip: {
    borderWidth: 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  decisionText: { fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  scoreCol: { gap: 2 },
  scoreLabel: { color: colors.textMuted, fontSize: 10 },
  scoreValue: { color: colors.textPrimary, fontSize: 20, fontWeight: '800' },
  catChip: {
    marginLeft: 'auto',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  catText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  riskText: { color: colors.tie, fontSize: 11 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  segment: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 96,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: colors.railActiveSurface, borderColor: colors.accent },
  segmentDisabled: { opacity: 0.35 },
  segmentText: { color: colors.textPrimary, fontSize: 12, fontWeight: '700' },
  progressRow: { flexDirection: 'row', gap: spacing.md },
  progressCell: { flex: 1, gap: 2 },
  progressValue: { color: colors.textPrimary, fontSize: 15, fontWeight: '800' },
  feedbackRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  feedbackValue: { fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  errorText: { color: colors.banker, fontSize: 12 },
  skipInfo: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: 4,
  },
  leanRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  leanValue: { fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  infoTag: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  infoTagText: { color: colors.textMuted, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  leanShare: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  whySkip: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  nonActionable: { color: colors.textMuted, fontSize: 11, fontStyle: 'italic' },
  details: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: 2,
  },
  traceText: { color: colors.textMuted, fontSize: 11 },
  matcher: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: 4,
  },
  matcherHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  matcherStateTag: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  matcherStateText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  matcherSignal: { fontSize: 14, fontWeight: '900', letterSpacing: 1, marginLeft: 'auto' },
  matcherLine: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  matcherMeta: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  matcherContextRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  matcherContext: { color: colors.textMuted, fontSize: 11, fontStyle: 'italic', flexShrink: 1 },
  matcherToggle: { paddingVertical: 2 },
  matcherToggleText: { color: colors.accent, fontSize: 11, fontWeight: '700' },
  matcherDetails: { gap: 2, paddingTop: 2 },
  matcherDetailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  matcherDetailKey: { color: colors.textMuted, fontSize: 11 },
  matcherDetailVal: { color: colors.textPrimary, fontSize: 11, fontWeight: '700' },
  thresholdBadge: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
});
