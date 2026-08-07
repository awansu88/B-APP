/**
 * Weighted Voting + Family Correlation Cap + Conflict Detection.
 *
 * Player and Banker support are computed INDEPENDENTLY. Correlated evidence
 * inside one family is capped via a discounted sum (w0 + d*w1 + d^2*w2 ...).
 * The CONTEXT family (regime) is multiplied by contextFamilyWeight so regime
 * modifies context rather than blindly duplicating trend evidence. Weighted
 * agreement is a consensus ratio and is NOT treated as a win probability.
 */
import { round6 } from '../analysis/helpers';
import { AnalysisSignal, clamp01, type ModuleAnalysis } from '../analysis/types';
import { ModuleStatus } from '../models/enums';
import { DecisionConfig } from './config';
import { FAMILY_ORDER, familyOf } from './families';
import {
  FamilyContribution,
  ModuleFamily,
  VoteSide,
  VotingResult,
} from './types';

const weightOf = (m: ModuleAnalysis): number =>
  clamp01(m.strength) * clamp01(m.reliability);

const discountedSum = (weightsDesc: readonly number[], discount: number): number => {
  let sum = 0;
  for (let i = 0; i < weightsDesc.length; i += 1) {
    sum += weightsDesc[i] * discount ** i;
  }
  return sum;
};

interface FamilyBucket {
  player: number[];
  banker: number[];
  moduleIds: string[];
}

/**
 * Aggregate ACTIVE, directional module results into independent Player/Banker
 * scores with the family correlation cap applied.
 */
export function computeVoting(
  moduleResults: readonly ModuleAnalysis[],
  config: DecisionConfig,
): VotingResult {
  const buckets = new Map<ModuleFamily, FamilyBucket>();
  let directionalModuleCount = 0;

  for (const m of moduleResults) {
    if (m.status !== ModuleStatus.ACTIVE) continue; // shadow/disabled never vote
    if (m.signal !== AnalysisSignal.PLAYER && m.signal !== AnalysisSignal.BANKER) {
      continue;
    }
    const w = weightOf(m);
    if (w <= 0) continue;
    const fam = familyOf(m.moduleId);
    const bucket = buckets.get(fam) ?? { player: [], banker: [], moduleIds: [] };
    if (m.signal === AnalysisSignal.PLAYER) bucket.player.push(w);
    else bucket.banker.push(w);
    bucket.moduleIds.push(m.moduleId);
    buckets.set(fam, bucket);
    directionalModuleCount += 1;
  }

  const familyContributions: FamilyContribution[] = [];
  let playerScore = 0;
  let bankerScore = 0;

  for (const fam of FAMILY_ORDER) {
    const bucket = buckets.get(fam);
    if (!bucket) continue;
    const famWeight = fam === ModuleFamily.CONTEXT ? config.contextFamilyWeight : 1;
    const player = round6(
      discountedSum([...bucket.player].sort((a, b) => b - a), config.correlationDiscount) *
        famWeight,
    );
    const banker = round6(
      discountedSum([...bucket.banker].sort((a, b) => b - a), config.correlationDiscount) *
        famWeight,
    );
    playerScore += player;
    bankerScore += banker;
    familyContributions.push({
      family: fam,
      player,
      banker,
      moduleIds: Object.freeze([...bucket.moduleIds]),
    });
  }

  playerScore = round6(playerScore);
  bankerScore = round6(bankerScore);

  const winner: VoteSide | null =
    playerScore > bankerScore
      ? VoteSide.PLAYER
      : bankerScore > playerScore
        ? VoteSide.BANKER
        : null;

  const total = playerScore + bankerScore;
  const maxScore = Math.max(playerScore, bankerScore);
  const minScore = Math.min(playerScore, bankerScore);
  const weightedAgreement = total > 0 ? round6(maxScore / total) : 0;
  const conflictScore = total > 0 ? round6(minScore / total) : 0;

  let supportingFamilyCount = 0;
  let opposingFamilyCount = 0;
  if (winner) {
    for (const c of familyContributions) {
      const win = winner === VoteSide.PLAYER ? c.player : c.banker;
      const lose = winner === VoteSide.PLAYER ? c.banker : c.player;
      if (win > lose) supportingFamilyCount += 1;
      else if (lose > win) opposingFamilyCount += 1;
    }
  }

  return {
    familyContributions: Object.freeze(familyContributions),
    playerScore,
    bankerScore,
    winner,
    weightedAgreement,
    conflictScore,
    directionalModuleCount,
    supportingFamilyCount,
    opposingFamilyCount,
  };
}
