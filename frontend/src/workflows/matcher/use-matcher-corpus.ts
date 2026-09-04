/**
 * M7.1 Patch 3 Stage B1 — `useMatcherCorpus`.
 *
 * React seam that memoizes the combined immutable BAPP-CORPUS-001 projection
 * and authoritative DB-002 user dataset (`useBappData`). It refreshes ONLY when
 * the user dataset identity or active shoe changes. The bundled projection is a
 * module-lifetime singleton and is never reconstructed or persisted here.
 */
import { useMemo } from 'react';

import type { MatcherCorpus } from '@/src/domain/matcher';
import { useBappData } from '@/src/workflows/backup/use-bapp-data';
import { matcherCorpusFromSources } from './corpus';

export interface UseMatcherCorpus {
  readonly corpus: MatcherCorpus;
  readonly loading: boolean;
  readonly reload: () => Promise<void>;
}

export function useMatcherCorpus(activeShoeId: string | null): UseMatcherCorpus {
  const { dataset, loading, reload } = useBappData();
  const corpus = useMemo(
    () => matcherCorpusFromSources(dataset, activeShoeId),
    [dataset, activeShoeId],
  );
  return { corpus, loading, reload };
}
