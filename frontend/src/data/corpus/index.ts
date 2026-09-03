import { BAPP_CORPUS_SHOES } from './bapp-corpus-001.generated';

// The generated array is frozen; freeze its authoritative entries at the public boundary too.
for (const shoe of BAPP_CORPUS_SHOES) Object.freeze(shoe);

export {
  BAPP_CORPUS_ENCODING,
  BAPP_CORPUS_SHOES,
  BAPP_CORPUS_VERSION,
} from './bapp-corpus-001.generated';
export type { BundledCorpusShoe } from './bapp-corpus-001.generated';
export { BAPP_CORPUS_MANIFEST } from './manifest';
export {
  BAPP_CORPUS_EPOCH_MS,
  BAPP_CORPUS_RUNTIME_ID_PREFIX,
  BAPP_CORPUS_TIMESTAMP,
  decodeBundledCorpus,
  getBundledCorpusProjection,
} from './decode';
export type { BundledCorpusProjection, CompactOutcome } from './types';
