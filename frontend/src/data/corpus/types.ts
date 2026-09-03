import type { RoundRecord } from '../../domain/models/round';
import type { ShoeRecord } from '../../domain/models/records';

export type CompactOutcome = 'P' | 'B' | 'T';

/** Runtime-only projection. It has no repository or SQLite dependency. */
export interface BundledCorpusProjection {
  readonly shoes: readonly ShoeRecord[];
  readonly rounds: readonly RoundRecord[];
}
