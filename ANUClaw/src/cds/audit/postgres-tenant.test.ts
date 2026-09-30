import { describe, it, expect } from 'vitest';
import { PostgresPerTenantAuditLog } from './postgres-tenant';
import { PgPoolLike, PgQueryResult } from './postgres-sink';

/** Fake multi-tenant pg pool (rows carry tenant_id; queries filter by it). */
class FakePool implements PgPoolLike {
  rows: Array<Record<string, unknown>> = [];
  ddl: string[] = [];
  async query(text: string, params?: unknown[]): Promise<PgQueryResult> {
    if (/^\s*(CREATE|DROP)/i.test(text)) { this.ddl.push(text.trim()); return { rows: [] }; }
    if (/INSERT INTO/i.test(text)) {
      const [tenant_id, seq, timestamp, actor, event_type, payload, prev_hash, entry_hash] = params!;
      this.rows.push({ tenant_id, seq, timestamp, actor, event_type, payload, prev_hash, entry_hash });
      return { rows: [] };
    }
    const tid = params?.[0];
    const mine = this.rows.filter((r) => r.tenant_id === tid);
    if (/ORDER BY seq DESC/i.test(text)) return { rows: mine.sort((a, b) => Number(b.seq) - Number(a.seq)).slice(0, 1) };
    if (/ORDER BY seq ASC/i.test(text)) return { rows: mine.sort((a, b) => Number(a.seq) - Number(b.seq)) };
    return { rows: [] };
  }
}

const clock = () => new Date('2026-06-14T00:00:00.000Z');

describe('PostgresPerTenantAuditLog (ops: durable per-tenant audit)', () => {
  it('creates an append-only multi-tenant table + no-mutate trigger', async () => {
    const pool = new FakePool();
    await new PostgresPerTenantAuditLog(pool).ensureSchema();
    expect(pool.ddl.some((q) => /CREATE TABLE IF NOT EXISTS cds_audit_log_mt/i.test(q))).toBe(true);
    expect(pool.ddl.some((q) => /PRIMARY KEY \(tenant_id, seq\)/i.test(q))).toBe(true);
    expect(pool.ddl.some((q) => /CREATE TRIGGER .*no_mutate/i.test(q))).toBe(true);
  });

  it('keeps each tenant on its own durable chain (isolated + verifiable)', async () => {
    const log = new PostgresPerTenantAuditLog(new FakePool(), 'cds_audit_log_mt', clock);
    await log.record('t1', { actor: 'a', event_type: 'e1', payload: { n: 1 } });
    await log.record('t1', { actor: 'a', event_type: 'e2', payload: { n: 2 } });
    await log.record('t2', { actor: 'b', event_type: 'e1', payload: { n: 9 } });

    expect((await log.entries('t1')).map((e) => e.seq)).toEqual([1, 2]);
    expect((await log.entries('t2')).map((e) => e.seq)).toEqual([1]);
    expect((await log.verify('t1')).valid).toBe(true);
    expect((await log.verify('t2')).valid).toBe(true);
  });

  it('export(tenant) returns only that tenant’s entries', async () => {
    const log = new PostgresPerTenantAuditLog(new FakePool(), 'cds_audit_log_mt', clock);
    await log.record('t1', { actor: 'a', event_type: 'e', payload: {} });
    await log.record('t2', { actor: 'b', event_type: 'e', payload: {} });
    await log.record('t2', { actor: 'b', event_type: 'e', payload: {} });
    expect((await log.export('t1')).entry_count).toBe(1);
    expect((await log.export('t2')).entry_count).toBe(2);
    expect((await log.export('t1')).head_hash).not.toBe((await log.export('t2')).head_hash);
  });

  it('round-trips JSON payloads and records sign-offs per tenant', async () => {
    const log = new PostgresPerTenantAuditLog(new FakePool(), 'cds_audit_log_mt', clock);
    await log.record('t1', { actor: 'sys', event_type: 'verdict', payload: { decision: 'block', n: 7 } });
    expect((await log.entries('t1'))[0].payload).toEqual({ decision: 'block', n: 7 });
    const e = await log.signOff('t1', { verdict_hash: 'h', clinician: { id: 'dr-ng' }, action: 'accept' });
    expect(e.actor).toBe('clinician:dr-ng');
    expect((await log.verify('t1')).valid).toBe(true);
  });
});
