/**
 * expo-sqlite adapter for the SqlDatabase abstraction (APP runtime only).
 * This is the only database file that imports a native module; it is imported
 * by app wiring, never by the pure domain engine or the test suite.
 */
import * as SQLite from 'expo-sqlite';

import { SqlDatabase, SqlParams, SqlRunResult } from './sql-database';

export class ExpoSqliteDatabase implements SqlDatabase {
  private constructor(private readonly db: SQLite.SQLiteDatabase) {}

  /** Open (or create) the on-device database and enable WAL when supported. */
  static async open(name: string): Promise<ExpoSqliteDatabase> {
    const db = await SQLite.openDatabaseAsync(name);
    try {
      // WAL improves concurrency; ignore if the platform does not support it.
      await db.execAsync('PRAGMA journal_mode = WAL;');
    } catch {
      // WAL unsupported — continue with the default journal mode.
    }
    await db.execAsync('PRAGMA foreign_keys = ON;');
    return new ExpoSqliteDatabase(db);
  }

  async execAsync(sql: string): Promise<void> {
    await this.db.execAsync(sql);
  }

  async runAsync(sql: string, params: SqlParams = []): Promise<SqlRunResult> {
    const result = await this.db.runAsync(sql, ...params);
    return {
      changes: result.changes,
      lastInsertRowId: result.lastInsertRowId,
    };
  }

  async getAllAsync<T = Record<string, unknown>>(
    sql: string,
    params: SqlParams = [],
  ): Promise<T[]> {
    return this.db.getAllAsync<T>(sql, ...params);
  }

  async getFirstAsync<T = Record<string, unknown>>(
    sql: string,
    params: SqlParams = [],
  ): Promise<T | null> {
    const row = await this.db.getFirstAsync<T>(sql, ...params);
    return row ?? null;
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    await this.db.withTransactionAsync(task);
  }
}
