import { PairState, RoundSource, SessionEnvironment, ShoeStatus, Winner } from '@/src/domain/models';
import {
  BAPP_CORPUS_SHOES,
  BAPP_CORPUS_VERSION,
  getBappCorpus001,
} from '@/src/data/corpus';

describe('BAPP-CORPUS-001', () => {
  test('contains the exact expected compact-corpus totals and valid unique ids', () => {
    const counts = { P: 0, B: 0, T: 0 };
    const ids = new Set<string>();
    let min = Infinity;
    let max = -Infinity;

    for (const shoe of BAPP_CORPUS_SHOES) {
      ids.add(shoe.id);
      min = Math.min(min, shoe.outcomes.length);
      max = Math.max(max, shoe.outcomes.length);
      for (const outcome of shoe.outcomes) counts[outcome] += 1;
    }

    expect(BAPP_CORPUS_VERSION).toBe('BAPP-CORPUS-001');
    expect(BAPP_CORPUS_SHOES).toHaveLength(1000);
    expect(ids.size).toBe(1000);
    expect(counts).toEqual({ P: 32591, B: 33495, T: 6814 });
    expect(counts.P + counts.B + counts.T).toBe(72900);
    expect(counts.P + counts.B).toBe(66086);
    expect(min).toBe(68);
    expect(max).toBe(79);
    expect((counts.P + counts.B + counts.T) / BAPP_CORPUS_SHOES.length).toBe(72.9);
  });

  test('decodes deterministically into one deeply immutable cached projection', () => {
    const first = getBappCorpus001();
    const second = getBappCorpus001();
    const firstCompact = BAPP_CORPUS_SHOES[0];
    const firstRound = first.rounds[0];

    expect(second).toBe(first);
    expect(first.shoes).toHaveLength(1000);
    expect(first.rounds).toHaveLength(72900);
    expect(first.shoes[0]).toMatchObject({
      id: firstCompact.id,
      environment: SessionEnvironment.HISTORY_INPUT,
      status: ShoeStatus.COMPLETED,
      roundCount: firstCompact.outcomes.length,
    });
    expect(firstRound).toMatchObject({
      id: `${firstCompact.id}:round:001`,
      shoeId: firstCompact.id,
      roundNumber: 1,
      winner: Winner.PLAYER,
      playerPair: PairState.UNKNOWN,
      bankerPair: PairState.UNKNOWN,
      source: RoundSource.HISTORY,
      createdAt: '2020-01-01T01:38:21.000Z',
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.shoes)).toBe(true);
    expect(Object.isFrozen(first.rounds)).toBe(true);
    expect(Object.isFrozen(first.shoes[0])).toBe(true);
    expect(Object.isFrozen(firstRound)).toBe(true);
  });
});
