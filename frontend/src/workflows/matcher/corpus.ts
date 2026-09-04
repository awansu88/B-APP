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
import { combineMatcherCorpora, prepareCorpus, type MatcherCorpus } from '@/src/domain/matcher';

let bundledMatcherCorpus: MatcherCorpus | null = null;

/** Lazily prepare and freeze immutable bundled matcher work once per process. */
export function getBundledMatcherCorpus(): MatcherCorpus {
  if (bundledMatcherCorpus) return bundledMatcherCorpus;
  const bundled = getBundledCorpusProjection();
  const prepared = prepareCorpus(bundled.shoes, bundled.rounds, null);
  Object.freeze(prepared.candidates);
  bundledMatcherCorpus = Object.freeze(prepared);
  return bundledMatcherCorpus;
}

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
  const bundled = getBundledMatcherCorpus();
  const user = prepareCorpus(dataset?.shoes ?? [], dataset?.rounds ?? [], activeShoeId);
  return combineMatcherCorpora(bundled, user);
}
