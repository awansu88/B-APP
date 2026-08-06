import { RoundSource } from '../../domain/models/enums';
import { PairState } from '../../domain/models/pair';
import { Winner } from '../../domain/models/outcome';
import { RoundRecord } from '../../domain/models/round';
import { RevisionRecord } from '../../domain/models/records';
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

  /**
   * Edit an existing round in place (winner / pair states only — the id, shoe
   * and round_number never change). The supplied audit revision is written in
   * the SAME transaction so an edit and its audit trail are atomic.
   */
  async update(round: RoundRecord, revision: RevisionRecord): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        `UPDATE rounds
           SET winner = ?, player_pair = ?, banker_pair = ?
         WHERE id = ?;`,
        [round.winner, round.playerPair, round.bankerPair, round.id],
      );
      await this.insertRevision(revision);
    });
  }

  /**
   * Replace the ENTIRE ordered round set of a shoe with `rounds` (already
   * renumbered 1..n by the caller) and write the audit revision — all inside a
   * single transaction. Used for deleting a middle round (which renumbers the
   * remainder) and for clearing a shoe (`rounds = []`). Raw rounds remain the
   * only source of truth; roadmaps are rebuilt from them afterwards.
   */
  async replaceShoe(
    shoeId: string,
    rounds: readonly RoundRecord[],
    revision: RevisionRecord,
  ): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync('DELETE FROM rounds WHERE shoe_id = ?;', [shoeId]);
      for (const round of rounds) {
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
      }
      await this.insertRevision(revision);
    });
  }

  private async insertRevision(revision: RevisionRecord): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO revisions (id, shoe_id, round_number, action, before, after, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [
        revision.id,
        revision.shoeId,
        revision.roundNumber,
        revision.action,
        revision.before,
        revision.after,
        revision.createdAt,
      ],
    );
  }
}
