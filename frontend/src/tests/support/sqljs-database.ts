/**
 * TEST-ONLY in-memory SqlDatabase driver backed by sql.js (pure JS/WASM
 * SQLite). Lets the exact same repositories/migrations run in Jest (node)
 * without the native expo-sqlite module. Never imported by app code.
 */
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';

import {
  SqlDatabase,
  SqlParam,
  SqlParams,
  SqlRunResult,
} from '@/src/data/database/sql-database';

let sqlPromise: Promise<SqlJsStatic> | null = null;
const getSql = (): Promise<SqlJsStatic> => {
  if (!sqlPromise) sqlPromise = initSqlJs();
  return sqlPromise;
};

export class SqlJsDatabase implements SqlDatabase {
  private constructor(private readonly db: Database) {}

  static async open(): Promise<SqlJsDatabase> {
    const SQL = await getSql();
    const db = new SQL.Database();
    db.run('PRAGMA foreign_keys = ON;');
    return new SqlJsDatabase(db);
  }

  async execAsync(sql: string): Promise<void> {
    this.db.run(sql);
  }

  async runAsync(sql: string, params: SqlParams = []): Promise<SqlRunResult> {
    this.db.run(sql, params as SqlParam[]);
    const changes = this.db.getRowsModified();
    const res = this.db.exec('SELECT last_insert_rowid() AS id;');
    const lastInsertRowId =
      res.length && res[0].values.length ? Number(res[0].values[0][0]) : 0;
    return { changes, lastInsertRowId };
  }

  async getAllAsync<T = Record<string, SqlParam>>(
    sql: string,
    params: SqlParams = [],
  ): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params as SqlParam[]);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as unknown as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  async getFirstAsync<T = Record<string, SqlParam>>(
    sql: string,
    params: SqlParams = [],
  ): Promise<T | null> {
    const rows = await this.getAllAsync<T>(sql, params);
    return rows.length ? rows[0] : null;
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    this.db.run('BEGIN;');
    try {
      await task();
      this.db.run('COMMIT;');
    } catch (error) {
      this.db.run('ROLLBACK;');
      throw error;
    }
  }
}
