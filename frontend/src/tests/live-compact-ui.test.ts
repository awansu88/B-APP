import { PredictionCategory, PredictionDecision } from '@/src/domain/models/enums';
import { compactLiveView } from '@/src/ui/live/compact-live-view';
import type { LockedPrediction } from '@/src/domain/session';
import { OperatorAction } from '@/src/domain/session';
import { operatorActionForDecision } from '@/src/workflows/session/operator-action';
import { operatorActionControlState } from '@/src/ui/history/operator-action-state';

const prediction = (
  decision: PredictionDecision,
  playerScore: number,
  bankerScore: number,
): LockedPrediction => ({
  decision,
  playerScore,
  bankerScore,
  confidence: 0.71,
  category: PredictionCategory.HIGH_RECOMMENDATION,
  matcherAudit: { status: 'ELIGIBLE', signal: 'PLAYER' },
  profileComparison: { selectedProfile: 'STRICT' },
  paper: { netUnits: 9 },
} as unknown as LockedPrediction);

describe('compact Live recommendation view', () => {
  it('normalizes carried PLAYED state for SKIP without resetting ordinary bets', () => {
    expect(
      operatorActionForDecision(OperatorAction.PLAYED, PredictionDecision.SKIP),
    ).toBe(OperatorAction.NOT_PLAYED);
    expect(
      operatorActionForDecision(OperatorAction.PLAYED, PredictionDecision.BET_PLAYER),
    ).toBe(OperatorAction.PLAYED);
    expect(
      operatorActionForDecision(OperatorAction.NOT_PLAYED, PredictionDecision.BET_BANKER),
    ).toBe(OperatorAction.NOT_PLAYED);
  });

  it('disables PLAYED and presents NOT PLAYED active for stale PLAYED state on SKIP', () => {
    expect(operatorActionControlState(OperatorAction.PLAYED, true)).toEqual({
      playedActive: false,
      notPlayedActive: true,
      playedDisabled: true,
    });
  });

  it.each([
    [PredictionDecision.BET_PLAYER, 'BET PLAYER'],
    [PredictionDecision.BET_BANKER, 'BET BANKER'],
    [PredictionDecision.SKIP, 'SKIP'],
  ])('maps the locked %s recommendation exactly', (decision, label) => {
    expect(compactLiveView(prediction(decision, 2, 1)).recommendation).toBe(label);
  });

  it.each([
    [3, 1, 'PLAYER'],
    [1, 3, 'BANKER'],
    [2, 2, 'NONE'],
    [0, 0, 'NONE'],
  ])('derives lean from accepted scores (%s, %s)', (player, banker, lean) => {
    expect(compactLiveView(prediction(PredictionDecision.SKIP, player, banker)).lean).toBe(lean);
  });

  it.each([PredictionDecision.BET_PLAYER, PredictionDecision.BET_BANKER, PredictionDecision.SKIP])(
    'always exposes lean for %s',
    (decision) => {
      expect(compactLiveView(prediction(decision, 1, 2)).lean).toBe('BANKER');
    },
  );

  it('does not expose telemetry in the compact projection', () => {
    const view = compactLiveView(prediction(PredictionDecision.SKIP, 1, 2));
    expect(Object.keys(view).sort()).toEqual(['lean', 'recommendation']);
    expect(view).not.toHaveProperty('confidence');
    expect(view).not.toHaveProperty('category');
    expect(view).not.toHaveProperty('matcherAudit');
    expect(view).not.toHaveProperty('profileComparison');
    expect(view).not.toHaveProperty('paper');
  });

  it('provides a compact waiting state without a lock', () => {
    expect(compactLiveView(null)).toEqual({ recommendation: 'WAITING', lean: null });
  });
});
