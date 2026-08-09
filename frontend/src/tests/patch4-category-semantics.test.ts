/**
 * M7.1 Patch 4.1A — CONFIDENCE CATEGORY SEMANTICS CLEANUP (deterministic).
 *
 * Proves the GENERAL "Confidence Categories" view keeps pure historical
 * fixed-0.55 EXPERIMENTAL semantics and never silently blends the
 * configuration-specific DECISION-004 / BALCFG-001 variable-floor EXPERIMENTAL
 * records into the same W/L denominator. DECISION-004 EXPERIMENTAL results stay
 * segmented (by balancedThreshold) in the Threshold Lab forward view.
 *
 * These tests are presentation/statistics only. They do NOT touch production
 * decision math (categoryFromConfidence, thresholds, voting, risk, matcher).
 */
import { computeFullStatistics } from '@/src/domain/statistics';
import { computeThresholdLabFromDataset } from '@/src/domain/observability';
import { BALANCED_CONFIG_VERSION, DECISION_004_VERSION } from '@/src/domain/decision';
import type { BappDataset, LockedPredictionEntryRecord } from '@/src/domain/backup/dataset';
import { EMPTY_DATASET } from '@/src/domain/backup/dataset';
import type { ShoeRecord } from '@/src/domain/models/records';

const shoe = (id: string): ShoeRecord => ({
  id,
  label: null,
  environment: 'LIVE_FORWARD' as ShoeRecord['environment'],
  status: 'ACTIVE' as ShoeRecord['status'],
  roundCount: 0,
  createdAt: 't',
  updatedAt: 't',
});

const dataset = (over: Partial<BappDataset>): BappDataset => ({ ...EMPTY_DATASET, ...over });

let seq = 0;
interface RecOpts {
  readonly id: string;
  readonly shoeId: string;
  readonly decision: string;
  readonly side?: string | null;
  readonly category: string;
  readonly evaluation: string;
  readonly confidence?: number;
  readonly invalidated?: boolean;
  readonly operatorAction?: string;
  readonly payload: object | string;
}

/** Build one immutable LPE record with an explicit (verbatim) payload. */
const rec = (o: RecOpts): LockedPredictionEntryRecord => ({
  id: o.id,
  shoeId: o.shoeId,
  targetRoundNumber: seq + 1,
  sequenceIndex: seq++,
  status: 'EVALUATED',
  decision: o.decision as LockedPredictionEntryRecord['decision'],
  side: (o.side ?? null) as LockedPredictionEntryRecord['side'],
  confidence: o.confidence ?? 0.6,
  category: o.category as LockedPredictionEntryRecord['category'],
  operatorAction: (o.operatorAction ?? 'PLAYED') as LockedPredictionEntryRecord['operatorAction'],
  evaluation: o.evaluation as LockedPredictionEntryRecord['evaluation'],
  actualWinner: null,
  invalidated: o.invalidated ?? false,
  invalidatedByRevisionId: null,
  invalidatedAt: null,
  lockedAt: 't',
  evaluatedAt: 't',
  payloadVersion: 'SESSION-001',
  payload: typeof o.payload === 'string' ? o.payload : JSON.stringify(o.payload),
  createdAt: 't',
});

/** Legacy (fixed-0.55) DECISION-001/002/003 lock. */
const legacy = (
  o: Omit<RecOpts, 'payload'> & { readonly version?: string },
): LockedPredictionEntryRecord =>
  rec({ ...o, payload: { decisionConfigVersion: o.version ?? 'DECISION-001' } });

/** DECISION-004 / BALCFG-001 lock where BALANCED is the OFFICIAL selected profile. */
const d004 = (
  o: Omit<RecOpts, 'payload'> & { readonly threshold: number },
): LockedPredictionEntryRecord =>
  rec({
    ...o,
    payload: {
      shoeId: o.shoeId,
      decisionConfigVersion: DECISION_004_VERSION,
      balancedConfigVersion: BALANCED_CONFIG_VERSION,
      balancedThreshold: o.threshold,
      decision: o.decision,
      profileComparison: { selectedProfile: 'BALANCED', balanced: { decision: o.decision } },
    },
  });

const generalExp = (lpe: LockedPredictionEntryRecord[]) => {
  const s = computeFullStatistics(dataset({ shoes: [shoe('S1'), shoe('S2')], lockedPredictions: lpe }));
  return { s, exp: s.categories.find((c) => c.category === 'EXPERIMENTAL')! };
};

beforeEach(() => {
  seq = 0;
});

// ===========================================================================
// A — legacy Experimental retains fixed-0.55 general semantics
// ===========================================================================
describe('Patch 4.1A — general Confidence Categories keep fixed-0.55 semantics', () => {
  it('A: DECISION-001/002/003 EXPERIMENTAL records populate the general band', () => {
    const lpe = [
      legacy({ id: 'a', shoeId: 'S1', decision: 'BET_PLAYER', side: 'PLAYER', category: 'EXPERIMENTAL', evaluation: 'WIN', confidence: 0.57, version: 'DECISION-001' }),
      legacy({ id: 'b', shoeId: 'S1', decision: 'BET_BANKER', side: 'BANKER', category: 'EXPERIMENTAL', evaluation: 'LOSS', confidence: 0.58, version: 'DECISION-002' }),
      legacy({ id: 'c', shoeId: 'S1', decision: 'BET_PLAYER', side: 'PLAYER', category: 'EXPERIMENTAL', evaluation: 'WIN', confidence: 0.56, version: 'DECISION-003' }),
    ];
    const { s, exp } = generalExp(lpe);
    expect(exp).toMatchObject({ totalBet: 3, win: 2, loss: 1, push: 0 });
    expect(exp.winRate).toMatchObject({ numerator: 2, denominator: 3 });
    expect(s.decision004Experimental).toBe(0);
  });

  // =========================================================================
  // B — DECISION-004 @0.52 conf 0.53: stored EXPERIMENTAL, NOT blended in
  // =========================================================================
  it('B: DECISION-004 @0.52 (conf 0.53) stays EXPERIMENTAL but is excluded from the legacy denominator', () => {
    const lpe = [
      legacy({ id: 'a', shoeId: 'S1', decision: 'BET_PLAYER', side: 'PLAYER', category: 'EXPERIMENTAL', evaluation: 'WIN', confidence: 0.57 }),
      legacy({ id: 'b', shoeId: 'S1', decision: 'BET_BANKER', side: 'BANKER', category: 'EXPERIMENTAL', evaluation: 'LOSS', confidence: 0.58 }),
      d004({ id: 'c', shoeId: 'S2', decision: 'BET_PLAYER', side: 'PLAYER', category: 'EXPERIMENTAL', evaluation: 'WIN', confidence: 0.53, threshold: 0.52 }),
    ];
    const { s, exp } = generalExp(lpe);
    // Only the two legacy records form the general Experimental W/L denominator.
    expect(exp).toMatchObject({ totalBet: 2, win: 1, loss: 1 });
    expect(exp.winRate.denominator).toBe(2);
    expect(s.decision004Experimental).toBe(1);
  });

  // =========================================================================
  // C — DECISION-004 @0.53 conf 0.54: carries threshold-0.53 semantics (Lab)
  // =========================================================================
  it('C: DECISION-004 @0.53 (conf 0.54) is associated with the 0.53 threshold bucket', () => {
    const lpe = [
      d004({ id: 'a', shoeId: 'S1', decision: 'BET_PLAYER', side: 'PLAYER', category: 'EXPERIMENTAL', evaluation: 'WIN', confidence: 0.54, threshold: 0.53 }),
    ];
    const ds = dataset({ shoes: [shoe('S1')], lockedPredictions: lpe });
    const lab = computeThresholdLabFromDataset(ds);
    const b053 = lab.buckets.find((b) => b.threshold === 0.53)!;
    expect(b053).toMatchObject({ eligibleDecisions: 1, bet: 1, officialBets: 1, win: 1, loss: 0 });
    // Not present in any other bucket.
    for (const t of [0.55, 0.54, 0.52]) {
      expect(lab.buckets.find((b) => b.threshold === t)!.eligibleDecisions).toBe(0);
    }
    // And never blended into the general Experimental band.
    const exp = computeFullStatistics(ds).categories.find((c) => c.category === 'EXPERIMENTAL')!;
    expect(exp.totalBet).toBe(0);
  });

  // =========================================================================
  // D — DECISION-004 @0.55 remains version/config identifiable
  // =========================================================================
  it('D: DECISION-004 @0.55 is still version/config identifiable and Lab-bucketed', () => {
    const lpe = [
      d004({ id: 'a', shoeId: 'S1', decision: 'BET_PLAYER', side: 'PLAYER', category: 'EXPERIMENTAL', evaluation: 'WIN', confidence: 0.57, threshold: 0.55 }),
    ];
    const ds = dataset({ shoes: [shoe('S1')], lockedPredictions: lpe });
    const s = computeFullStatistics(ds);
    expect(s.categories.find((c) => c.category === 'EXPERIMENTAL')!.totalBet).toBe(0);
    expect(s.decision004Experimental).toBe(1);
    const lab = computeThresholdLabFromDataset(ds);
    expect(lab.withBalcfg).toBe(1);
    expect(lab.buckets.find((b) => b.threshold === 0.55)!.eligibleDecisions).toBe(1);
  });

  // =========================================================================
  // E — mixed dataset: no misleading blended general Experimental denominator
  // =========================================================================
  it('E: legacy + DECISION-004 @0.52/0.53/0.54 do NOT dilute the general Experimental denominator', () => {
    const lpe = [
      legacy({ id: 'a', shoeId: 'S1', decision: 'BET_PLAYER', side: 'PLAYER', category: 'EXPERIMENTAL', evaluation: 'WIN', confidence: 0.57 }),
      legacy({ id: 'b', shoeId: 'S1', decision: 'BET_PLAYER', side: 'PLAYER', category: 'EXPERIMENTAL', evaluation: 'WIN', confidence: 0.58 }),
      d004({ id: 'c', shoeId: 'S2', decision: 'BET_BANKER', side: 'BANKER', category: 'EXPERIMENTAL', evaluation: 'LOSS', confidence: 0.525, threshold: 0.52 }),
      d004({ id: 'd', shoeId: 'S2', decision: 'BET_PLAYER', side: 'PLAYER', category: 'EXPERIMENTAL', evaluation: 'WIN', confidence: 0.535, threshold: 0.53 }),
      d004({ id: 'e', shoeId: 'S2', decision: 'BET_BANKER', side: 'BANKER', category: 'EXPERIMENTAL', evaluation: 'LOSS', confidence: 0.545, threshold: 0.54 }),
    ];
    const ds = dataset({ shoes: [shoe('S1'), shoe('S2')], lockedPredictions: lpe });
    const s = computeFullStatistics(ds);
    const exp = s.categories.find((c) => c.category === 'EXPERIMENTAL')!;
    // Pure legacy denominator: 2 wins / 2 = 100% — NOT the blended 2/5 = 40%.
    expect(exp).toMatchObject({ totalBet: 2, win: 2, loss: 0 });
    expect(exp.winRate).toMatchObject({ numerator: 2, denominator: 2, percent: 100 });
    expect(s.decision004Experimental).toBe(3);
    // Threshold Lab keeps the three DECISION-004 records segmented by threshold.
    const lab = computeThresholdLabFromDataset(ds);
    expect(lab.withBalcfg).toBe(3);
    expect(lab.buckets.find((b) => b.threshold === 0.52)!.eligibleDecisions).toBe(1);
    expect(lab.buckets.find((b) => b.threshold === 0.53)!.eligibleDecisions).toBe(1);
    expect(lab.buckets.find((b) => b.threshold === 0.54)!.eligibleDecisions).toBe(1);
  });

  // =========================================================================
  // F — Threshold Lab segmentation remains 0.55 / 0.54 / 0.53 / 0.52
  // =========================================================================
  it('F: Threshold Lab always exposes the four presets in descending order', () => {
    const lab = computeThresholdLabFromDataset(EMPTY_DATASET);
    expect(lab.buckets.map((b) => b.threshold)).toEqual([0.55, 0.54, 0.53, 0.52]);
  });

  // =========================================================================
  // G — QUALIFIED and HIGH behavior remain unchanged (version-insensitive)
  // =========================================================================
  it('G: QUALIFIED and HIGH bands still pool DECISION-004 records (identical semantics)', () => {
    const lpe = [
      d004({ id: 'a', shoeId: 'S1', decision: 'BET_PLAYER', side: 'PLAYER', category: 'QUALIFIED', evaluation: 'WIN', confidence: 0.65, threshold: 0.53 }),
      legacy({ id: 'b', shoeId: 'S1', decision: 'BET_BANKER', side: 'BANKER', category: 'QUALIFIED', evaluation: 'LOSS', confidence: 0.66 }),
      d004({ id: 'c', shoeId: 'S1', decision: 'BET_BANKER', side: 'BANKER', category: 'HIGH_RECOMMENDATION', evaluation: 'WIN', confidence: 0.72, threshold: 0.53 }),
      legacy({ id: 'd', shoeId: 'S1', decision: 'BET_PLAYER', side: 'PLAYER', category: 'HIGH_RECOMMENDATION', evaluation: 'WIN', confidence: 0.74 }),
    ];
    const s = computeFullStatistics(dataset({ shoes: [shoe('S1')], lockedPredictions: lpe }));
    const qual = s.categories.find((c) => c.category === 'QUALIFIED')!;
    const high = s.categories.find((c) => c.category === 'HIGH_RECOMMENDATION')!;
    // DECISION-004 QUALIFIED + HIGH ARE pooled (same 0.60/0.70 semantics as legacy).
    expect(qual).toMatchObject({ totalBet: 2, win: 1, loss: 1 });
    expect(high).toMatchObject({ totalBet: 2, win: 2, loss: 0 });
    // Only the EXPERIMENTAL band is version-sensitive; no Experimental records here.
    expect(s.decision004Experimental).toBe(0);
  });

  // =========================================================================
  // H — old records without Patch-4 config remain readable
  // =========================================================================
  it('H: pre-Patch-4 locks (empty / malformed payload) remain readable as legacy', () => {
    const lpe = [
      rec({ id: 'a', shoeId: 'S1', decision: 'BET_PLAYER', side: 'PLAYER', category: 'EXPERIMENTAL', evaluation: 'WIN', confidence: 0.57, payload: '{}' }),
      rec({ id: 'b', shoeId: 'S1', decision: 'BET_BANKER', side: 'BANKER', category: 'QUALIFIED', evaluation: 'LOSS', confidence: 0.65, payload: 'not-json' }),
    ];
    const ds = dataset({ shoes: [shoe('S1')], lockedPredictions: lpe });
    const s = computeFullStatistics(ds);
    // Legacy readable: the empty-payload EXPERIMENTAL record stays in the general band.
    expect(s.categories.find((c) => c.category === 'EXPERIMENTAL')!.totalBet).toBe(1);
    expect(s.decision004Experimental).toBe(0);
    // Threshold Lab reports them as NOT_AVAILABLE coverage (never bucketed).
    const lab = computeThresholdLabFromDataset(ds);
    expect(lab.withBalcfg).toBe(0);
    expect(lab.withoutBalcfg).toBe(2);
  });
});
