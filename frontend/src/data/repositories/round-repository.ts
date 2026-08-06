import { RoundSource } from '../../domain/models/enums';
import { PairState } from '../../domain/models/pair';
import { Winner } from '../../domain/models/outcome';
import { RoundRecord } from '../../domain/models/round';
import { SqlDatabase } from '../database/sql-database';

interface RoundRow {
  id: string;
  shoe_id: string;
  round_number: number;
  winner: string;
  player_pair: string;
  banker_pair: string;
  source: string;
  created_at: string;
}

const mapRound = (row: RoundRow): RoundRecord => ({
  id: row.id,
  shoeId: row.shoe_id,
  roundNumber: row.round_number,
  winner: row.winner as Winner,
  playerPair: row.player_pair as PairState,
  bankerPair: row.banker_pair as PairState,
  source: row.source as RoundSource,
  createdAt: row.created_at,
});

/**
 * Repository for raw rounds — the only source of truth. `append` writes the
 * round AND an audit revision inside a single transaction (multi-table op).
 * `shoe_id` + `round_number` is unique, so duplicate rounds are rejected.
 */
export class RoundRepository {
  constructor(private readonly db: SqlDatabase) {}

  async append(round: RoundRecord): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        `INSERT INTO rounds (id, shoe_id, round_number, winner, player_pair, banker_pair, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          round.id,
          round.shoeId,
          round.roundNumber,
          round.winner,
          round.playerPair,
          round.bankerPair,
          round.source,
          round.createdAt,
        ],
      );
      await this.db.runAsync(
        `INSERT INTO revisions (id, shoe_id, round_number, action, before, after, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [
          `rev-${round.id}-insert`,
          round.shoeId,
          round.roundNumber,
          'INSERT',
          null,
          JSON.stringify(round),
          round.createdAt,
        ],
      );
    });
  }

  async listByShoe(shoeId: string): Promise<RoundRecord[]> {
    const rows = await this.db.getAllAsync<RoundRow>(
      'SELECT * FROM rounds WHERE shoe_id = ? ORDER BY round_number ASC;',
      [shoeId],
    );
    return rows.map(mapRound);
  }

  async getByShoeAndNumber(
    shoeId: string,
    roundNumber: number,
  ): Promise<RoundRecord | null> {
    const row = await this.db.getFirstAsync<RoundRow>(
      'SELECT * FROM rounds WHERE shoe_id = ? AND round_number = ?;',
      [shoeId, roundNumber],
    );
    return row ? mapRound(row) : null;
  }

  /** Delete the final round of a shoe and record the DELETE revision atomically. */
  async deleteFinal(shoeId: string, deletedAt: string): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      const last = await this.db.getFirstAsync<RoundRow>(
        'SELECT * FROM rounds WHERE shoe_id = ? ORDER BY round_number DESC LIMIT 1;',
        [shoeId],
      );
      if (!last) return;
      await this.db.runAsync('DELETE FROM rounds WHERE id = ?;', [last.id]);
      await this.db.runAsync(
        `INSERT INTO revisions (id, shoe_id, round_number, action, before, after, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [
          `rev-${last.id}-delete`,
          shoeId,
          last.round_number,
          'DELETE',
          JSON.stringify(mapRound(last)),
          null,
          deletedAt,
        ],
      );
    });
  }
}
