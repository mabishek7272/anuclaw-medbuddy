/**
 * Durable per-tenant audit (ops follow-up) — Postgres-backed.
 *
 * Each tenant gets an independent hash chain stored in one table keyed by
 * (tenant_id, seq) — composite PK — so chains are isolated AND durable across
 * restarts. Append-only is enforced at the DB by a no-mutate trigger. This is
 * the production form of `PerTenantAuditLog` (which used in-memory sinks).
 *
 * Additive: the global `PostgresAuditSink` and its tests are unchanged.
 */

import { AsyncAuditLog, AsyncAuditSink } from './async-audit-log';
import { PgPoolLike } from './postgres-sink';
import { RecordInput } from './entry-factory';
import {
  AuditBundle,
  AuditEntry,
  BundleSigner,
  ChainVerification,
  SignOffParams,
} from './types';

const COLUMNS = 'tenant_id, seq, "timestamp", actor, event_type, payload, prev_hash, entry_hash';

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

/** Async audit sink scoped to one tenant's rows in the multi-tenant table. */
export class TenantScopedPgSink implements AsyncAuditSink {
  constructor(
    private readonly pool: PgPoolLike,
    private readonly tenantId: string,
    private readonly table: string = 'cds_audit_log_mt',
  ) {}

  async append(e: AuditEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO ${this.table} (${COLUMNS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [this.tenantId, e.seq, e.timestamp, e.actor, e.event_type, JSON.stringify(e.payload), e.prev_hash, e.entry_hash],
    );
  }

  async all(): Promise<AuditEntry[]> {
    const r = await this.pool.query(
      `SELECT ${COLUMNS} FROM ${this.table} WHERE tenant_id = $1 ORDER BY seq ASC`,
      [this.tenantId],
    );
    return r.rows.map(rowToEntry);
  }

  async head(): Promise<AuditEntry | null> {
    const r = await this.pool.query(
      `SELECT ${COLUMNS} FROM ${this.table} WHERE tenant_id = $1 ORDER BY seq DESC LIMIT 1`,
      [this.tenantId],
    );
    return r.rows.length ? rowToEntry(r.rows[0]) : null;
  }
}

/** Create the append-only multi-tenant audit table + no-mutate trigger. */
export async function ensureTenantAuditSchema(
  pool: PgPoolLike,
  table = 'cds_audit_log_mt',
): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${table} (
       tenant_id  TEXT   NOT NULL,
       seq        BIGINT NOT NULL,
       "timestamp" TEXT  NOT NULL,
       actor      TEXT   NOT NULL,
       event_type TEXT   NOT NULL,
       payload    JSONB  NOT NULL,
       prev_hash  TEXT   NOT NULL,
       entry_hash TEXT   NOT NULL,
       PRIMARY KEY (tenant_id, seq)
     )`,
  );
  await pool.query(
    `CREATE OR REPLACE FUNCTION ${table}_no_mutate() RETURNS trigger AS $$
     BEGIN RAISE EXCEPTION '${table} is append-only'; RETURN NULL; END;
     $$ LANGUAGE plpgsql`,
  );
  await pool.query(`DROP TRIGGER IF EXISTS ${table}_no_mutate_trg ON ${table}`);
  await pool.query(
    `CREATE TRIGGER ${table}_no_mutate_trg BEFORE UPDATE OR DELETE ON ${table}
     FOR EACH ROW EXECUTE FUNCTION ${table}_no_mutate()`,
  );
}

/** Postgres-backed per-tenant audit log (durable form of PerTenantAuditLog). */
export class PostgresPerTenantAuditLog {
  private readonly logs = new Map<string, AsyncAuditLog>();

  constructor(
    private readonly pool: PgPoolLike,
    private readonly table: string = 'cds_audit_log_mt',
    private readonly clock: () => Date = () => new Date(),
  ) {}

  ensureSchema(): Promise<void> {
    return ensureTenantAuditSchema(this.pool, this.table);
  }

  forTenant(tenantId: string): AsyncAuditLog {
    let log = this.logs.get(tenantId);
    if (!log) {
      log = new AsyncAuditLog(new TenantScopedPgSink(this.pool, tenantId, this.table), this.clock);
      this.logs.set(tenantId, log);
    }
    return log;
  }

  record(tenantId: string, input: RecordInput): Promise<AuditEntry> {
    return this.forTenant(tenantId).record(input);
  }
  signOff(tenantId: string, params: SignOffParams): Promise<AuditEntry> {
    return this.forTenant(tenantId).signOff(params);
  }
  verify(tenantId: string): Promise<ChainVerification> {
    return this.forTenant(tenantId).verify();
  }
  entries(tenantId: string): Promise<AuditEntry[]> {
    return this.forTenant(tenantId).entries();
  }
  export(tenantId: string, signer?: BundleSigner): Promise<AuditBundle> {
    return this.forTenant(tenantId).export(signer);
  }
}
