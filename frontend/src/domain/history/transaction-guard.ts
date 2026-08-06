/**
 * A tiny re-entrancy guard used to prevent double-taps and concurrent writes
 * while a database transaction is in flight. Pure TypeScript.
 *
 * The History Input screen wraps every persistence action in `run()`. A second
 * action attempted while the first is still running is rejected with a
 * `BusyError` instead of corrupting round ordering or creating duplicate rounds.
 */
export class BusyError extends Error {
  constructor(message = 'A write is already in progress') {
    super(message);
    this.name = 'BusyError';
  }
}

export class TransactionGuard {
  private busy = false;

  /** True while a guarded task is running. */
  get isBusy(): boolean {
    return this.busy;
  }

  /**
   * Run `task` exclusively. If another task is already running, reject
   * immediately with a `BusyError` (the caller should ignore the extra tap).
   */
  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.busy) throw new BusyError();
    this.busy = true;
    try {
      return await task();
    } finally {
      this.busy = false;
    }
  }

  /**
   * Synchronous variant: returns `false` (and does nothing) when busy, otherwise
   * runs the task and returns `true`. Useful for pure, non-async guards in tests.
   */
  tryRun(task: () => void): boolean {
    if (this.busy) return false;
    this.busy = true;
    try {
      task();
      return true;
    } finally {
      this.busy = false;
    }
  }
}
