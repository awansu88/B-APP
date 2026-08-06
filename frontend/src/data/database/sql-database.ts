/**
 * UI-independent SQL database abstraction.
 *
 * Repositories depend ONLY on this interface, never on a concrete driver, so
 * the same repository code runs against expo-sqlite (app) and an in-memory
 * SQLite (tests). No React / UI imports here.
 */
export type SqlParam = string | number | null;
export type SqlParams = readonly SqlParam[];

export interface SqlRunResult {
  readonly changes: number;
  readonly lastInsertRowId: number;
}

export interface SqlDatabase {
  /** Execute one or more statements with no bound parameters (DDL / PRAGMA). */
  execAsync(sql: string): Promise<void>;
  /** Execute a single parameterized write statement. */
  runAsync(sql: string, params?: SqlParams): Promise<SqlRunResult>;
  /** Run a parameterized query and return all rows. */
  getAllAsync<T = Record<string, SqlParam>>(
    sql: string,
    params?: SqlParams,
  ): Promise<T[]>;
  /** Run a parameterized query and return the first row (or null). */
  getFirstAsync<T = Record<string, SqlParam>>(
    sql: string,
    params?: SqlParams,
  ): Promise<T | null>;
  /** Run a task inside a transaction; roll back on any thrown error. */
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
