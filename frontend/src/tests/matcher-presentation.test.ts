/**
 * M7.1 Patch 3 Stage B2 — Historical Matcher PRESENTATION view-model tests.
 *
 * Deterministic tests for the Settings / Live / Statistics presentation layer.
 * They exercise the pure view-models over authoritative domain state (no
 * rendering, no engine changes) — including the ELIGIBLE / ABSTAIN / ACTIVE
 * states that cannot naturally occur in the small web preview corpus.
 */
import { computeMatcherReadiness } from '@/src/domain/observability/decision-observability';
import {
  aggregateMatcherAudits,
  type StoredMatcherAudit,
} from '@/src/domain/observability/matcher-observability';
import {
  buildMatcherLiveView,
  buildMatcherSettingsView,
  matcherAbstainDistribution,
  matcherAbstainLabel,
  matcherCoverageLabel,
} from '@/src/domain/observability/matcher-presentation';
import type { MatcherAudit } from '@/src/domain/matcher';
import {
  HISTORICAL_MATCHER_RELIABILITY,
  HISTORICAL_MATCHER_VERSION,
  MATCH_FINGERPRINT_VERSION,
  RELIABILITY_PRIOR_VERSION_V2,
  TOP_K,
} from '@/src/domain/matcher';

const audit = (over: Partial<MatcherAudit>): MatcherAudit => ({
  matcherVersion: HISTORICAL_MATCHER_VERSION,
  fingerprintVersion: MATCH_FINGERPRINT_VERSION,
  reliabilityVersion: RELIABILITY_PRIOR_VERSION_V2,
  status: 'ELIGIBLE',
  eligible: true,
  completedShoes: 100,
  nonTieRounds: 5000,
  candidatesConsidered: 40,
  effectiveMatches: 12,
  topK: TOP_K,
  topSimilarity: 0.92,
  meanTopSimilarity: 0.87,
  playerSupport: 8,
  bankerSupport: 2,
  signal: 'PLAYER',
  strength: 0.72,
  reliability: HISTORICAL_MATCHER_RELIABILITY,
  abstainReason: null,
  ...over,
});

// ===========================================================================
// SETTINGS
// ===========================================================================
describe('Settings matcher view-model', () => {
  it('0 / 100 and 0 / 5000 => COLLECTING, STRICT disabled, BALANCED waiting', () => {
    const v = buildMatcherSettingsView(computeMatcherReadiness(0, 0));
    expect(v.collection).toBe('ACTIVE');
    expect(v.completedShoesLabel).toBe('0 / 100');
    expect(v.nonTieRoundsLabel).toBe('0 / 5,000');
    expect(v.eligibility).toBe('COLLECTING');
    expect(v.strictVoting).toBe('DISABLED');
    expect(v.balancedVoting).toBe('WAITING FOR ELIGIBILITY');
  });

  it('partially collected => still COLLECTING', () => {
    const v = buildMatcherSettingsView(computeMatcherReadiness(42, 2430));
    expect(v.completedShoesLabel).toBe('42 / 100');
    expect(v.nonTieRoundsLabel).toBe('2,430 / 5,000');
    expect(v.eligibility).toBe('COLLECTING');
    expect(v.balancedVoting).toBe('WAITING FOR ELIGIBILITY');
  });

  it('exactly 100 / 5000 => ELIGIBLE, BALANCED auto quality-gated, STRICT still disabled', () => {
    const v = buildMatcherSettingsView(computeMatcherReadiness(100, 5000));
    expect(v.eligibility).toBe('ELIGIBLE');
    expect(v.eligible).toBe(true);
    expect(v.strictVoting).toBe('DISABLED');
    expect(v.balancedVoting).toBe('AUTO — QUALITY GATED');
  });

  it('one threshold short of both => COLLECTING (BOTH gates required)', () => {
    expect(buildMatcherSettingsView(computeMatcherReadiness(100, 4999)).eligibility).toBe('COLLECTING');
    expect(buildMatcherSettingsView(computeMatcherReadiness(99, 5000)).eligibility).toBe('COLLECTING');
  });
});

// ===========================================================================
// LIVE
// ===========================================================================
describe('Live matcher view-model', () => {
  it('no audit => NOT_AVAILABLE (backward compatible)', () => {
    const v = buildMatcherLiveView(undefined, 'BALANCED');
    expect(v.available).toBe(false);
    expect(v.state).toBe('NOT_AVAILABLE');
    expect(v.stateLabel).toBe('NOT AVAILABLE');
  });

  it('COLLECTING => progress + WAITING FOR ELIGIBILITY, no signal', () => {
    const v = buildMatcherLiveView(
      audit({ status: 'COLLECTING', eligible: false, completedShoes: 42, nonTieRounds: 2430, signal: 'ABSTAIN', abstainReason: 'GLOBAL_INELIGIBLE' }),
      'BALANCED',
    );
    expect(v.state).toBe('COLLECTING');
    expect(v.shoesLabel).toBe('42 / 100');
    expect(v.roundsLabel).toBe('2,430 / 5,000');
    expect(v.votingLabel).toBe('WAITING FOR ELIGIBILITY');
    expect(v.signal).toBeNull();
  });

  it('ELIGIBLE + ABSTAIN => reason label + technical details', () => {
    const v = buildMatcherLiveView(
      audit({ signal: 'ABSTAIN', abstainReason: 'TIED_OR_DISPERSED_SUPPORT', strength: 0 }),
      'BALANCED',
    );
    expect(v.state).toBe('ELIGIBLE_ABSTAIN');
    expect(v.stateLabel).toBe('ELIGIBLE — ABSTAIN');
    expect(v.abstainReasonLabel).toBe('Dispersed / tied support');
    expect(v.signal).toBeNull();
    expect(v.details.map((d) => d.label)).toEqual([
      'Candidates',
      'Effective Matches',
      'Top Similarity',
      'Mean Similarity',
      'Strength',
    ]);
  });

  it('ACTIVE PLAYER => signal PLAYER, evidence (strength) not probability', () => {
    const v = buildMatcherLiveView(audit({ signal: 'PLAYER', strength: 0.72 }), 'BALANCED');
    expect(v.state).toBe('ACTIVE');
    expect(v.signal).toBe('PLAYER');
    expect(v.evidenceLabel).toBe('0.72');
    expect(v.effectiveMatches).toBe(12);
  });

  it('ACTIVE BANKER => signal BANKER', () => {
    const v = buildMatcherLiveView(audit({ signal: 'BANKER', playerSupport: 2, bankerSupport: 8 }), 'BALANCED');
    expect(v.state).toBe('ACTIVE');
    expect(v.signal).toBe('BANKER');
  });

  it('matcher signal is NEVER a standalone actionable bet', () => {
    const v = buildMatcherLiveView(audit({ signal: 'PLAYER' }), 'BALANCED');
    expect(v.isActionableSignal).toBe(false);
  });

  it('evidence label is a score, never a probability wording', () => {
    const v = buildMatcherLiveView(audit({ signal: 'PLAYER', strength: 0.5 }), 'BALANCED');
    expect(v.evidenceLabel).toBe('0.50');
    // no percentage / probability symbols leak into the presentation value
    expect(v.evidenceLabel).not.toContain('%');
  });

  it('STRICT selected => matcher is COMPARISON / CONTROL · NON-ACTIONABLE', () => {
    const v = buildMatcherLiveView(audit({ signal: 'PLAYER' }), 'STRICT');
    expect(v.state).toBe('ACTIVE');
    expect(v.contextLabel).toBe('COMPARISON / CONTROL · NON-ACTIONABLE');
    expect(v.isActionableSignal).toBe(false);
  });

  it('BALANCED selected => matcher is supporting evidence, not a second recommendation', () => {
    const v = buildMatcherLiveView(audit({ signal: 'PLAYER' }), 'BALANCED');
    expect(v.contextLabel).toContain('Supporting evidence');
    expect(v.contextLabel).toContain('Decision Pipeline');
  });
});

// ===========================================================================
// STATISTICS
// ===========================================================================
describe('Statistics matcher presentation', () => {
  it('zero audit records => 0 / 0 predictions coverage', () => {
    expect(matcherCoverageLabel(aggregateMatcherAudits([], 0))).toBe('0 / 0 predictions');
  });

  it('old records => NOT_AVAILABLE coverage denominator (not dropped)', () => {
    const r = aggregateMatcherAudits([null, null, { status: 'COLLECTING', signal: 'ABSTAIN' }], 3);
    expect(matcherCoverageLabel(r)).toBe('1 / 3 predictions');
    expect(r.withoutAudit).toBe(2);
  });

  it('partial coverage with PLAYER / BANKER / ABSTAIN + reason distribution', () => {
    const audits: StoredMatcherAudit[] = [
      { status: 'ELIGIBLE', signal: 'PLAYER', effectiveMatches: 20, meanTopSimilarity: 0.9 },
      { status: 'ELIGIBLE', signal: 'BANKER', effectiveMatches: 10, meanTopSimilarity: 0.8 },
      { status: 'ELIGIBLE', signal: 'ABSTAIN', abstainReason: 'INSUFFICIENT_SIMILARITY' },
      { status: 'ELIGIBLE', signal: 'ABSTAIN', abstainReason: 'INSUFFICIENT_SIMILARITY' },
      { status: 'COLLECTING', signal: 'ABSTAIN', abstainReason: 'GLOBAL_INELIGIBLE' },
    ];
    const r = aggregateMatcherAudits(audits, 8); // 3 old records without audit
    expect(matcherCoverageLabel(r)).toBe('5 / 8 predictions');
    expect(r.playerSignals).toBe(1);
    expect(r.bankerSignals).toBe(1);
    expect(r.abstain).toBe(3);
    expect(r.collecting).toBe(1);
    const dist = matcherAbstainDistribution(r);
    expect(dist[0]).toEqual({ reason: 'INSUFFICIENT_SIMILARITY', label: 'Insufficient similarity', count: 2 });
    expect(dist.find((d) => d.reason === 'GLOBAL_INELIGIBLE')?.count).toBe(1);
  });

  it('abstain label maps only actual HMATCH-002 reasons; null => dash', () => {
    expect(matcherAbstainLabel('INSUFFICIENT_CANDIDATES')).toBe('Insufficient candidates');
    expect(matcherAbstainLabel(null)).toBe('\u2014');
  });
});
