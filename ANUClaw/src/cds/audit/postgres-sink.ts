/**
 * Postgres-backed append-only audit sink (plan §5.4).
 *
 * Durable across restarts and append-only AT THE DATABASE LEVEL: a BEFORE
 * UPDATE/DELETE trigger raises an exception, so even a privileged client cannot
 * silently rewrite history. Combined with the hash chain, that makes tampering
 * both prevented and detectable.
 *
 * Depends only on a minimal `PgPoolLike` (a `query` method), so `src/cds` does
 * not import the `pg` package directly — the app passes its existing pool.
 */

import { AuditEntry } from './types';
import { AsyncAuditSink } from './async-audit-log';

export interface PgQueryResult {
  rows: Array<Record<string, unknown>>;
}

export interface PgPoolLike {
  query(text: string, params?: unknown[]): Promise<PgQueryResult>;
}

const COLUMNS = 'seq, "timestamp", actor, event_type, payload, prev_hash, entry_hash';

function rowToEntry(row: Record<string, unknown>): AuditEntry {
  const payload = row.payload;
  return {
    seq: Number(row.seq),
    timestamp: String(row.timestamp),
    actor: String(row.actor),
    event_type: String(row.event_type),
    payload: typeof payload === 'string' ? JSON.parse(payload) : payload,
    prev_hash: String(row.prev_hash),
    entry_hash: String(row.entry_hash),
  };
}

export class PostgresAuditSink implements AsyncAuditSink {
  constructor(
    private readonly pool: PgPoolLike,
    private readonly table: string = 'cds_audit_log',
  ) {}

  /** Create the append-only table + the no-mutate trigger. Idempotent. */
  async ensureSchema(): Promise<void> {
    const t = this.table;
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${t} (
         seq        BIGINT PRIMARY KEY,
         "timestamp" TEXT  NOT NULL,
         actor      TEXT   NOT NULL,
         event_type TEXT   NOT NULL,
         payload    JSONB  NOT NULL,
         prev_hash  TEXT   NOT NULL,
         entry_hash TEXT   NOT NULL
       )`,
    );
    await this.pool.query(
      `CREATE OR REPLACE FUNCTION ${t}_no_mutate() RETURNS trigger AS $$
       BEGIN RAISE EXCEPTION '${t} is append-only'; RETURN NULL; END;
       $$ LANGUAGE plpgsql`,
    );
    await this.pool.query(`DROP TRIGGER IF EXISTS ${t}_no_mutate_trg ON ${t}`);
    await this.pool.query(
      `CREATE TRIGGER ${t}_no_mutate_trg BEFORE UPDATE OR DELETE ON ${t}
       FOR EACH ROW EXECUTE FUNCTION ${t}_no_mutate()`,
    );
  }

  async append(e: AuditEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO ${this.table} (${COLUMNS}) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        e.seq,
        e.timestamp,
        e.actor,
        e.event_type,
        JSON.stringify(e.payload),
        e.prev_hash,
        e.entry_hash,
      ],
    );
  }

  async all(): Promise<AuditEntry[]> {
    const r = await this.pool.query(
      `SELECT ${COLUMNS} FROM ${this.table} ORDER BY seq ASC`,
    );
    return r.rows.map(rowToEntry);
  }

  async head(): Promise<AuditEntry | null> {
    const r = await this.pool.query(
      `SELECT ${COLUMNS} FROM ${this.table} ORDER BY seq DESC LIMIT 1`,
    );
    return r.rows.length ? rowToEntry(r.rows[0]) : null;
  }
}
