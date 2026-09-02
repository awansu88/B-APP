import { VERSION_REGISTRY } from '../../config/versions';

export const BAPP_CORPUS_MANIFEST = Object.freeze({
  version: VERSION_REGISTRY.corpus,
  sourceDataset:
    '100,000 unique simulated baccarat shoes; 8 decks; approximately 50-card cut card; raw cards reduced to P/B/T outcomes',
  samplingMethodology: 'Deterministic distributed sampling',
  samplingVersion: 'BAPP-CORPUS-SAMPLING-001',
  sampleCount: 1000,
  roundCount: 72900,
  nonTieRounds: 66086,
  playerCount: 32591,
  bankerCount: 33495,
  tieCount: 6814,
  sha256: 'da1be17266426ab2ef3ae986ae38ce6b4810f4437bf48660cc87edd0f65afc8d',
} as const);
