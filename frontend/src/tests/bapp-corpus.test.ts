import {
  BAPP_CORPUS_ENCODING,
  BAPP_CORPUS_SHOES,
  BAPP_CORPUS_VERSION,
  BAPP_CORPUS_MANIFEST,
  decodeBundledCorpus,
  getBundledCorpusProjection,
} from '@/src/data/corpus';
import { VERSION_REGISTRY } from '@/src/config/versions';
import { RoundSource, ShoeStatus } from '@/src/domain/models/enums';
import { Winner } from '@/src/domain/models/outcome';
import { PairState } from '@/src/domain/models/pair';
import { SessionEnvironment } from '@/src/domain/session/environment';

describe('BAPP-CORPUS-001 integrity', () => {
  it('matches every locked structural and outcome invariant', () => {
    const ids = new Set<string>();
    const counts = { P: 0, B: 0, T: 0, invalid: 0 };
    let rounds = 0;
    const lengths: number[] = [];
    for (const shoe of BAPP_CORPUS_SHOES) {
      expect(shoe.id).not.toBe('');
      expect(shoe.id).toMatch(/^b\d+$/);
      expect(shoe.sourceIndex).toBeGreaterThanOrEqual(0);
      ids.add(shoe.id);
      expect(shoe.outcomes.length).toBeGreaterThan(0);
      lengths.push(shoe.outcomes.length);
      rounds += shoe.outcomes.length;
      for (const outcome of shoe.outcomes) {
        if (outcome === 'P' || outcome === 'B' || outcome === 'T') counts[outcome] += 1;
        else counts.invalid += 1;
      }
    }
    expect(BAPP_CORPUS_VERSION).toBe('BAPP-CORPUS-001');
    expect(BAPP_CORPUS_ENCODING).toBe('PBT-STRING-001');
    expect(BAPP_CORPUS_MANIFEST.version).toBe(BAPP_CORPUS_VERSION);
    expect(BAPP_CORPUS_MANIFEST.encoding).toBe(BAPP_CORPUS_ENCODING);
    expect(VERSION_REGISTRY.corpus).toBe(BAPP_CORPUS_VERSION);
    expect(BAPP_CORPUS_SHOES).toHaveLength(1000);
    expect(rounds).toBe(72900);
    expect(counts).toEqual({ P: 32591, B: 33495, T: 6814, invalid: 0 });
    expect(counts.P + counts.B).toBe(66086);
    expect(ids.size).toBe(1000);
    expect(Math.min(...lengths)).toBe(68);
    expect(Math.max(...lengths)).toBe(79);
    expect(rounds / lengths.length).toBe(72.9);
    expect(BAPP_CORPUS_MANIFEST).toMatchObject({
      sampleCount: 1000, roundCount: 72900, playerCount: 32591, bankerCount: 33495,
      tieCount: 6814, nonTieRounds: 66086,
      sha256: 'da1be17266426ab2ef3ae986ae38ce6b4810f4437bf48660cc87edd0f65afc8d',
    });
  });

  it('exposes frozen compact source data and metadata', () => {
    expect(Object.isFrozen(BAPP_CORPUS_SHOES)).toBe(true);
    expect(BAPP_CORPUS_SHOES.every(Object.isFrozen)).toBe(true);
    expect(BAPP_CORPUS_SHOES.slice(0, 3).map(({ id, sourceIndex }) => ({ id, sourceIndex }))).toEqual([
      { id: 'b100529068', sourceIndex: 59 },
      { id: 'b101373524', sourceIndex: 153 },
      { id: 'b102439174', sourceIndex: 272 },
    ]);
    expect(Object.isFrozen(BAPP_CORPUS_MANIFEST)).toBe(true);
    expect(() => (BAPP_CORPUS_SHOES as unknown as { pop(): unknown }).pop()).toThrow();
    expect(BAPP_CORPUS_SHOES).toHaveLength(1000);
  });
});

describe('BAPP-CORPUS-001 deterministic runtime projection', () => {
  it('decodes deterministically without clock or random dependencies', () => {
    const now = jest.spyOn(Date, 'now');
    const random = jest.spyOn(Math, 'random');
    const first = decodeBundledCorpus();
    const second = decodeBundledCorpus();
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(now).not.toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
    now.mockRestore();
    random.mockRestore();
  });

  it('maps canonical record fields and stable IDs', () => {
    const projection = decodeBundledCorpus([{ id: 'b100529068', sourceIndex: 59, outcomes: 'PBT' }]);
    expect(projection.shoes).toEqual([{ id: 'corpus001-b100529068', label: 'BAPP-CORPUS-001',
      environment: SessionEnvironment.HISTORY_INPUT, status: ShoeStatus.ARCHIVED, roundCount: 3,
      createdAt: '2000-01-01T00:00:59.000Z', updatedAt: '2000-01-01T00:00:59.000Z' }]);
    expect(projection.rounds.map((round) => round.id)).toEqual([
      'corpus001-b100529068-r1', 'corpus001-b100529068-r2', 'corpus001-b100529068-r3',
    ]);
    expect(projection.rounds.map((round) => round.winner)).toEqual([
      Winner.PLAYER, Winner.BANKER, Winner.TIE,
    ]);
    for (const round of projection.rounds) {
      expect(round.shoeId).toBe('corpus001-b100529068');
      expect(round.playerPair).toBe(PairState.UNKNOWN);
      expect(round.bankerPair).toBe(PairState.UNKNOWN);
      expect(round.source).toBe(RoundSource.HISTORY);
      expect(round.createdAt).toMatch(/^2000-01-01T00:00:59\.00[1-3]Z$/);
      expect(Object.isFrozen(round)).toBe(true);
    }
  });

  it('caches one frozen projection and consumers cannot corrupt it', () => {
    const first = getBundledCorpusProjection();
    expect(getBundledCorpusProjection()).toBe(first);
    expect(first.shoes).toHaveLength(1000);
    expect(first.shoes.every((shoe) => shoe.id.startsWith('corpus001-b'))).toBe(true);
    expect(new Set(first.shoes.map((shoe) => shoe.id)).size).toBe(1000);
    expect(first.rounds[0].id).toBe('corpus001-b100529068-r1');
    expect(first.rounds).toHaveLength(72900);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.shoes)).toBe(true);
    expect(Object.isFrozen(first.rounds)).toBe(true);
    expect(first.shoes.every(Object.isFrozen)).toBe(true);
    expect(first.rounds.every(Object.isFrozen)).toBe(true);
    expect(() => (first.rounds as unknown as { pop(): unknown }).pop()).toThrow();
    expect(getBundledCorpusProjection().rounds).toHaveLength(72900);
  });

  it('rejects invalid compact outcomes rather than silently projecting them', () => {
    expect(() => decodeBundledCorpus([{ id: 'invalid', sourceIndex: 0, outcomes: 'PX' }])).toThrow(
      'Invalid bundled corpus outcome: X',
    );
  });

  it('has no database write path or database module dependency', () => {
    const loadedModules = Object.keys(require.cache);
    expect(loadedModules.some((path) => path.includes('/data/database/'))).toBe(false);
    expect(loadedModules.some((path) => path.includes('/data/repositories/'))).toBe(false);
  });
});
