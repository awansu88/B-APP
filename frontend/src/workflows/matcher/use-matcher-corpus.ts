/**
 * M7.1 Patch 3 Stage B1 — `useMatcherCorpus`.
 *
 * React seam that memoizes the pre-result Historical Matcher corpus from the
 * authoritative DB-002 dataset (`useBappData`). It refreshes ONLY when the
 * dataset identity or the active shoe changes (a new ARCHIVED shoe or an
 * accepted revision produces a new dataset via `useBappData().reload`, which
 * re-derives the corpus). It does NOT reconstruct on every render, and it never
 * persists a competing source of truth.
 */
import { useMemo } from 'react';

import type { MatcherCorpus } from '@/src/domain/matcher';
import { useBappData } from '@/src/workflows/backup/use-bapp-data';
import { matcherCorpusFromDataset } from './corpus';

export interface UseMatcherCorpus {
  readonly corpus: MatcherCorpus | undefined;
  readonly loading: boolean;
  readonly reload: () => Promise<void>;
}

export function useMatcherCorpus(activeShoeId: string | null): UseMatcherCorpus {
  const { dataset, loading, reload } = useBappData();
  const corpus = useMemo(
    () => matcherCorpusFromDataset(dataset, activeShoeId),
    [dataset, activeShoeId],
  );
  return { corpus, loading, reload };
}
