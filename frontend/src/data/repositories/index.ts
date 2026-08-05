import type { RoundRecord } from '../../domain/models/round';

/**
 * Repository contracts (Milestone 0: interfaces only — no implementations to
 * avoid partially integrated features). Implementations arrive in a later
 * milestone backed by `@/src/utils/storage`.
 */
export interface RoundRepository {
  listByShoe(shoeId: string): Promise<RoundRecord[]>;
  append(round: RoundRecord): Promise<void>;
}

export interface ShoeSummary {
  readonly shoeId: string;
  readonly roundCount: number;
}

export interface ShoeRepository {
  list(): Promise<ShoeSummary[]>;
}
