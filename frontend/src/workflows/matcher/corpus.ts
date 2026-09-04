/**
 * M7.1 Patch 3 Stage B1 — production Historical Matcher corpus wiring.
 *
 * The matcher corpus is DERIVED runtime data (NO second database / NO DB-003):
 * it combines the immutable BAPP-CORPUS-001 runtime projection with the
 * authoritative DB-002 user dataset (including current rounds after accepted
 * revisions). The ACTIVE user shoe is excluded by `prepareCorpus`. Neither
 * source is mutated or persisted by this adapter. This is the SINGLE production
 * path — no UI component ever constructs matcher data by hand.
 */
import { getBundledCorpusProjection } from '@/src/data/corpus';
import type { BappDataset } from '@/src/domain/backup';
import { prepareCorpus, type MatcherCorpus } from '@/src/domain/matcher';

/**
 * Build the pre-result matcher corpus from immutable bundled history plus the
 * authoritative user dataset projection. A missing user dataset still produces
 * the bundled corpus. `activeShoeId` is excluded as a historical source.
 * Deterministic and safe to memoize on user dataset identity + active shoe id.
 */
export function matcherCorpusFromSources(
  dataset: BappDataset | null | undefined,
  activeShoeId: string | null,
): MatcherCorpus {
  const bundled = getBundledCorpusProjection();
  return prepareCorpus(
    [...bundled.shoes, ...(dataset?.shoes ?? [])],
    [...bundled.rounds, ...(dataset?.rounds ?? [])],
    activeShoeId,
  );
}
