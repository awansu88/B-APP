import {
  SessionEnvironment,
  ShoeStatus,
} from '../../domain/models/enums';
import { ShoeRecord } from '../../domain/models/records';
import { SqlDatabase } from '../database/sql-database';

interface ShoeRow {
  id: string;
  label: string | null;
  environment: string;
  status: string;
  round_count: number;
  created_at: string;
  updated_at: string;
}

const mapShoe = (row: ShoeRow): ShoeRecord => ({
  id: row.id,
  label: row.label,
  environment: row.environment as SessionEnvironment,
  status: row.status as ShoeStatus,
  roundCount: row.round_count,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** Repository for shoes. Depends only on the SqlDatabase abstraction. */
export class ShoeRepository {
  constructor(private readonly db: SqlDatabase) {}

  async insert(shoe: ShoeRecord): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO shoes (id, label, environment, status, round_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [
        shoe.id,
        shoe.label,
        shoe.environment,
        shoe.status,
        shoe.roundCount,
        shoe.createdAt,
        shoe.updatedAt,
      ],
    );
  }

  async getById(id: string): Promise<ShoeRecord | null> {
    const row = await this.db.getFirstAsync<ShoeRow>(
      'SELECT * FROM shoes WHERE id = ?;',
      [id],
    );
    return row ? mapShoe(row) : null;
  }

  async list(): Promise<ShoeRecord[]> {
    const rows = await this.db.getAllAsync<ShoeRow>(
      'SELECT * FROM shoes ORDER BY created_at ASC;',
    );
    return rows.map(mapShoe);
  }

  async setRoundCount(id: string, roundCount: number, updatedAt: string): Promise<void> {
    await this.db.runAsync(
      'UPDATE shoes SET round_count = ?, updated_at = ? WHERE id = ?;',
      [roundCount, updatedAt, id],
    );
  }

  /**
   * Update a shoe's mutable metadata (label / environment / status /
   * round_count) in place. Never uses INSERT OR REPLACE (that would cascade
   * delete the shoe's rounds); a plain UPDATE keeps raw rounds intact.
   */
  async updateMeta(shoe: ShoeRecord): Promise<void> {
    await this.db.runAsync(
      `UPDATE shoes
         SET label = ?, environment = ?, status = ?, round_count = ?, updated_at = ?
       WHERE id = ?;`,
      [
        shoe.label,
        shoe.environment,
        shoe.status,
        shoe.roundCount,
        shoe.updatedAt,
        shoe.id,
      ],
    );
  }
}
