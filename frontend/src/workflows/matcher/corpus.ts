/**
 * M7.1 Patch 3 Stage B1 — production Historical Matcher corpus wiring.
 *
 * The matcher corpus is DERIVED runtime data (NO second database / NO DB-003):
 * it is projected from the authoritative DB-002 dataset (all shoes + current
 * authoritative rounds after accepted revisions). The ACTIVE shoe is excluded
 * from the historical source by `prepareCorpus`. Ties never count toward the
 * non-Tie eligibility total. This is the SINGLE production path — no UI
 * component ever constructs matcher data by hand.
 */
import type { BappDataset } from '@/src/domain/backup';
import { prepareCorpus, type MatcherCorpus } from '@/src/domain/matcher';

/**
 * Build the pre-result matcher corpus from the authoritative dataset projection.
 * `activeShoeId` (the current live shoe) is always excluded as a historical
 * source. Pure + deterministic — safe to memoize on the dataset identity.
 */
export function matcherCorpusFromDataset(
  dataset: BappDataset | null | undefined,
  activeShoeId: string | null,
): MatcherCorpus | undefined {
  if (!dataset) return undefined;
  return prepareCorpus(dataset.shoes, dataset.rounds, activeShoeId);
}
