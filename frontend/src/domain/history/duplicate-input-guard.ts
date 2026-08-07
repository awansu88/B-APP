/**
 * DuplicateInputGuard — accidental rapid double-tap protection for the single
 * PLAYER / TIE / BANKER result button (Milestone 5C input-safety; NO domain math).
 *
 * Problem it solves (data integrity): on fast storage a result submission for
 * round N can commit in a few ms, immediately re-arming the controls for N+1.
 * A second tap belonging to the SAME physical double-tap gesture would then
 * silently become the actual result for N+1 — creating two baccarat rounds from
 * one gesture.
 *
 * Semantics (see docs):
 *   - The FIRST tap is always accepted immediately (no startup delay — never
 *     interferes with deliberate manual entry).
 *   - After an accepted tap, further taps within `windowMs` are REJECTED
 *     (treated as the tail of the same accidental double-tap gesture).
 *   - Once `windowMs` has elapsed the controls are re-armed and the next
 *     explicit tap submits the next round normally.
 *
 * This is purely a UI-input debounce. It does NOT touch prediction/lock/
 * evaluation/sequence logic, and it complements (does not replace) the
 * TransactionGuard, which handles truly CONCURRENT in-flight submissions.
 */
export class DuplicateInputGuard {
  private armedUntil = 0;

  /**
   * @param windowMs re-arm window in ms. Short enough to never impede manual
   *   entry (a human observes the outcome + picks PLAYED/NOT_PLAYED first),
   *   long enough to absorb a physical double-tap. Default 400ms.
   * @param now injectable clock (deterministic tests).
   */
  constructor(
    private readonly windowMs = 400,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /**
   * Returns true and arms the guard when the input should be accepted; returns
   * false when the input falls inside the re-arm window (accidental rapid tap).
   */
  tryAccept(): boolean {
    const t = this.now();
    if (t < this.armedUntil) return false;
    this.armedUntil = t + this.windowMs;
    return true;
  }

  /** Force re-arm immediately (e.g. New Shoe / session reset). */
  reset(): void {
    this.armedUntil = 0;
  }
}
