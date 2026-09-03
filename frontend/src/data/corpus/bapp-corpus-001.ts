import { RoundSource, SessionEnvironment, ShoeStatus } from '@/src/domain/models/enums';
import { Winner } from '@/src/domain/models/outcome';
import { PairState } from '@/src/domain/models/pair';
import type { RoundRecord } from '@/src/domain/models/round';
import type { ShoeRecord } from '@/src/domain/models/records';

import {
  BAPP_CORPUS_SHOES,
  BAPP_CORPUS_VERSION,
  type BundledCorpusShoe,
} from './bapp-corpus-001.generated';

export { BAPP_CORPUS_ENCODING, BAPP_CORPUS_SHOES, BAPP_CORPUS_VERSION } from './bapp-corpus-001.generated';

/** Immutable runtime representation of the bundled, authoritative corpus. */
export interface BappCorpusProjection {
  readonly version: typeof BAPP_CORPUS_VERSION;
  readonly shoes: readonly ShoeRecord[];
  readonly rounds: readonly RoundRecord[];
}

const CORPUS_EPOCH_MS = Date.UTC(2020, 0, 1);

const timestampFor = (sourceIndex: number, roundOffset = 0): string =>
  new Date(CORPUS_EPOCH_MS + sourceIndex * 100_000 + roundOffset * 1_000).toISOString();

const winnerFor = (value: string): Winner => {
  switch (value) {
    case 'P': return Winner.PLAYER;
    case 'B': return Winner.BANKER;
    case 'T': return Winner.TIE;
    default: throw new Error(`Invalid ${BAPP_CORPUS_VERSION} outcome: ${value}`);
  }
};

const projectShoe = (compact: BundledCorpusShoe): { shoe: ShoeRecord; rounds: readonly RoundRecord[] } => {
  const createdAt = timestampFor(compact.sourceIndex);
  const rounds = Object.freeze(
    Array.from(compact.outcomes, (outcome, index): RoundRecord => Object.freeze({
      id: `${compact.id}:round:${String(index + 1).padStart(3, '0')}`,
      shoeId: compact.id,
      roundNumber: index + 1,
      winner: winnerFor(outcome),
      playerPair: PairState.UNKNOWN,
      bankerPair: PairState.UNKNOWN,
      source: RoundSource.HISTORY,
      createdAt: timestampFor(compact.sourceIndex, index + 1),
    })),
  );
  return Object.freeze({
    shoe: Object.freeze({
      id: compact.id,
      label: null,
      environment: SessionEnvironment.HISTORY_INPUT,
      status: ShoeStatus.COMPLETED,
      roundCount: rounds.length,
      createdAt,
      updatedAt: timestampFor(compact.sourceIndex, rounds.length),
    }),
    rounds,
  });
};

let cachedProjection: BappCorpusProjection | undefined;

/**
 * Decode the compact P/B/T payload once. The singleton cache and every exposed
 * collection/record are frozen; no database or matcher wiring is performed.
 */
export function getBappCorpus001(): BappCorpusProjection {
  if (cachedProjection) return cachedProjection;
  const projected = BAPP_CORPUS_SHOES.map(projectShoe);
  cachedProjection = Object.freeze({
    version: BAPP_CORPUS_VERSION,
    shoes: Object.freeze(projected.map(({ shoe }) => shoe)),
    rounds: Object.freeze(projected.flatMap(({ rounds }) => rounds)),
  });
  return cachedProjection;
}
