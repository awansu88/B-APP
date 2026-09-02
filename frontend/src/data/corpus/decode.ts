import { RoundSource, ShoeStatus } from '../../domain/models/enums';
import { Winner } from '../../domain/models/outcome';
import { PairState } from '../../domain/models/pair';
import type { RoundRecord } from '../../domain/models/round';
import type { ShoeRecord } from '../../domain/models/records';
import { SessionEnvironment } from '../../domain/session/environment';
import { BAPP_CORPUS_001 } from './bapp-corpus-001.generated';
import { BAPP_CORPUS_MANIFEST } from './manifest';
import type { BundledCorpusProjection, BundledCorpusShoe, CompactOutcome } from './types';

/** Stable metadata timestamp; decoding never reads the system clock. */
export const BAPP_CORPUS_TIMESTAMP = '2000-01-01T00:00:00.000Z';

const WINNER_BY_OUTCOME: Readonly<Record<CompactOutcome, Winner>> = Object.freeze({
  P: Winner.PLAYER,
  B: Winner.BANKER,
  T: Winner.TIE,
});

function winnerFor(outcome: string): Winner {
  const winner = WINNER_BY_OUTCOME[outcome as CompactOutcome];
  if (!winner) throw new Error(`Invalid bundled corpus outcome: ${outcome}`);
  return winner;
}

/** Pure decoder exposed for verification and tooling; normal consumers use the cached accessor. */
export function decodeBundledCorpus(
  compactShoes: readonly BundledCorpusShoe[] = BAPP_CORPUS_001,
): BundledCorpusProjection {
  const shoes: ShoeRecord[] = [];
  const rounds: RoundRecord[] = [];

  for (const compactShoe of compactShoes) {
    shoes.push(
      Object.freeze({
        id: compactShoe.id,
        label: BAPP_CORPUS_MANIFEST.version,
        environment: SessionEnvironment.HISTORY_INPUT,
        status: ShoeStatus.ARCHIVED,
        roundCount: compactShoe.outcomes.length,
        createdAt: BAPP_CORPUS_TIMESTAMP,
        updatedAt: BAPP_CORPUS_TIMESTAMP,
      }),
    );
    for (let index = 0; index < compactShoe.outcomes.length; index += 1) {
      const roundNumber = index + 1;
      rounds.push(
        Object.freeze({
          id: `${compactShoe.id}-r${roundNumber}`,
          shoeId: compactShoe.id,
          roundNumber,
          winner: winnerFor(compactShoe.outcomes[index]),
          playerPair: PairState.UNKNOWN,
          bankerPair: PairState.UNKNOWN,
          source: RoundSource.HISTORY,
          createdAt: BAPP_CORPUS_TIMESTAMP,
        }),
      );
    }
  }

  return Object.freeze({ shoes: Object.freeze(shoes), rounds: Object.freeze(rounds) });
}

let decodedCorpusCache: BundledCorpusProjection | null = null;

/** Decode once per module lifetime and return the immutable runtime projection thereafter. */
export function getBundledCorpusProjection(): BundledCorpusProjection {
  decodedCorpusCache ??= decodeBundledCorpus();
  return decodedCorpusCache;
}
