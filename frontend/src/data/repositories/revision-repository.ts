import { RevisionAction, RevisionRecord } from '../../domain/models/records';
import { SqlDatabase } from '../database/sql-database';

interface RevisionRow {
  id: string;
  shoe_id: string;
  round_number: number | null;
  action: string;
  before: string | null;
  after: string | null;
  created_at: string;
}

const mapRevision = (row: RevisionRow): RevisionRecord => ({
  id: row.id,
  shoeId: row.shoe_id,
  roundNumber: row.round_number,
  action: row.action as RevisionAction,
  before: row.before,
  after: row.after,
  createdAt: row.created_at,
});

/** Repository for audit revisions of raw rounds. */
export class RevisionRepository {
  constructor(private readonly db: SqlDatabase) {}

  async insert(revision: RevisionRecord): Promise<void> {
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

  async listByShoe(shoeId: string): Promise<RevisionRecord[]> {
    const rows = await this.db.getAllAsync<RevisionRow>(
      'SELECT * FROM revisions WHERE shoe_id = ? ORDER BY created_at ASC;',
      [shoeId],
    );
    return rows.map(mapRevision);
  }
}
