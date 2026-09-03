import { RoundSource, ShoeStatus } from '../../domain/models/enums';
import { Winner } from '../../domain/models/outcome';
import { PairState } from '../../domain/models/pair';
import type { RoundRecord } from '../../domain/models/round';
import type { ShoeRecord } from '../../domain/models/records';
import { SessionEnvironment } from '../../domain/session/environment';
import { BAPP_CORPUS_SHOES } from './bapp-corpus-001.generated';
import { BAPP_CORPUS_MANIFEST } from './manifest';
import type { BundledCorpusProjection, CompactOutcome } from './types';

/** Fixed origin used with sourceIndex and round index; decoding never reads the system clock. */
export const BAPP_CORPUS_EPOCH_MS = Date.UTC(2000, 0, 1);
export const BAPP_CORPUS_TIMESTAMP = new Date(BAPP_CORPUS_EPOCH_MS).toISOString();
export const BAPP_CORPUS_RUNTIME_ID_PREFIX = 'corpus001-';

const WINNER_BY_OUTCOME: Readonly<Record<CompactOutcome, Winner>> = Object.freeze({
  P: Winner.PLAYER,
  B: Winner.BANKER,
  T: Winner.TIE,
});

type CompactShoeInput = Readonly<{
  id: string;
  sourceIndex: number;
  outcomes: string;
}>;

function winnerFor(outcome: string): Winner {
  const winner = WINNER_BY_OUTCOME[outcome as CompactOutcome];
  if (!winner) throw new Error(`Invalid bundled corpus outcome: ${outcome}`);
  return winner;
}

function timestampFor(sourceIndex: number, roundIndex = 0): string {
  return new Date(BAPP_CORPUS_EPOCH_MS + sourceIndex * 1000 + roundIndex).toISOString();
}

/** Pure decoder exposed for verification and tooling; normal consumers use the cached accessor. */
export function decodeBundledCorpus(
  compactShoes: readonly CompactShoeInput[] = BAPP_CORPUS_SHOES,
): BundledCorpusProjection {
  const shoes: ShoeRecord[] = [];
  const rounds: RoundRecord[] = [];

  for (const compactShoe of compactShoes) {
    const runtimeShoeId = `${BAPP_CORPUS_RUNTIME_ID_PREFIX}${compactShoe.id}`;
    const shoeTimestamp = timestampFor(compactShoe.sourceIndex);
    shoes.push(
      Object.freeze({
        id: runtimeShoeId,
        label: BAPP_CORPUS_MANIFEST.version,
        environment: SessionEnvironment.HISTORY_INPUT,
        status: ShoeStatus.ARCHIVED,
        roundCount: compactShoe.outcomes.length,
        createdAt: shoeTimestamp,
        updatedAt: shoeTimestamp,
      }),
    );
    for (let index = 0; index < compactShoe.outcomes.length; index += 1) {
      const roundNumber = index + 1;
      rounds.push(
        Object.freeze({
          id: `${runtimeShoeId}-r${roundNumber}`,
          shoeId: runtimeShoeId,
          roundNumber,
          winner: winnerFor(compactShoe.outcomes[index]),
          playerPair: PairState.UNKNOWN,
          bankerPair: PairState.UNKNOWN,
          source: RoundSource.HISTORY,
          createdAt: timestampFor(compactShoe.sourceIndex, roundNumber),
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
