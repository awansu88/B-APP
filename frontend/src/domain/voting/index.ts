import { VERSION_REGISTRY } from '../../config/versions';

/**
 * Voting aggregation (Milestone 0: contract only, no logic).
 * ACTIVE analyzers cast weighted votes; the aggregator combines them into a
 * single directional signal. No automatic global self-learning (Principle #6).
 */
export const VOTING_VERSION = VERSION_REGISTRY.voting;

export type VoteDirection = 'PLAYER' | 'BANKER' | 'NONE';

export interface AnalyzerVote {
  readonly analyzerId: string;
  readonly direction: VoteDirection;
  readonly weight: number;
}
