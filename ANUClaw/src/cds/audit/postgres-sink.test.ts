import { describe, it, expect } from 'vitest';
import { PostgresAuditSink, PgPoolLike, PgQueryResult } from './postgres-sink';
import { AsyncAuditLog } from './async-audit-log';
import { runAuditedPipelineAsync } from './audited-pipeline';
import { makeSnapshot, fixedClock } from '../safety/test-helpers';

/** In-memory fake of a pg Pool — emulates the SQL the sink issues. */
class FakePool implements PgPoolLike {
  rows: Array<Record<string, unknown>> = [];
  ddl: string[] = [];

  async query(text: string, params?: unknown[]): Promise<PgQueryResult> {
    if (/^\s*(CREATE|DROP)/i.test(text)) {
      this.ddl.push(text.trim());
      return { rows: [] };
    }
    if (/INSERT INTO/i.test(text)) {
      const [seq, timestamp, actor, event_type, payload, prev_hash, entry_hash] = params!;
      this.rows.push({ seq, timestamp, actor, event_type, payload, prev_hash, entry_hash });
      return { rows: [] };
    }
    if (/ORDER BY seq DESC/i.test(text)) {
      const sorted = [...this.rows].sort((a, b) => Number(b.seq) - Number(a.seq));
      return { rows: sorted.slice(0, 1) };
    }
    if (/ORDER BY seq ASC/i.test(text)) {
      return { rows: [...this.rows].sort((a, b) => Number(a.seq) - Number(b.seq)) };
    }
    return { rows: [] };
  }
}

describe('PostgresAuditSink (plan §5.4)', () => {
  it('ensureSchema creates an append-only table + no-mutate trigger', async () => {
    const pool = new FakePool();
    await new PostgresAuditSink(pool).ensureSchema();
    expect(pool.ddl.some((q) => /CREATE TABLE IF NOT EXISTS cds_audit_log/i.test(q))).toBe(true);
    expect(pool.ddl.some((q) => /CREATE TRIGGER .*no_mutate/i.test(q))).toBe(true);
  });

  it('records a verifiable hash chain over Postgres', async () => {
    const sink = new PostgresAuditSink(new FakePool());
    const log = new AsyncAuditLog(sink, fixedClock);
    await log.record({ actor: 'a', event_type: 'e1', payload: { n: 1 } });
    await log.record({ actor: 'b', event_type: 'e2', payload: { n: 2 } });
    await log.record({ actor: 'c', event_type: 'e3', payload: { n: 3 } });

    const entries = await log.entries();
    expect(entries.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect((await log.head())?.seq).toBe(3);
    expect((await log.verify()).valid).toBe(true);
  });

  it('round-trips a structured JSON payload', async () => {
    const log = new AsyncAuditLog(new PostgresAuditSink(new FakePool()), fixedClock);
    await log.record({ actor: 'a', event_type: 'verdict', payload: { decision: 'block', n: 7 } });
    const [entry] = await log.entries();
    expect(entry.payload).toEqual({ decision: 'block', n: 7 });
  });

  it('detects tampering with a stored row (hash chain over the DB)', async () => {
    const pool = new FakePool();
    const log = new AsyncAuditLog(new PostgresAuditSink(pool), fixedClock);
    await log.record({ actor: 'a', event_type: 'e1', payload: { dose: 'standard' } });
    await log.record({ actor: 'b', event_type: 'e2', payload: { dose: 'standard' } });

    // Attacker edits the stored payload directly (entry_hash now stale).
    pool.rows[0].payload = JSON.stringify({ dose: 'double' });
    expect((await log.verify()).valid).toBe(false);
  });

  it('runs the audited pipeline async end-to-end into Postgres', async () => {
    const log = new AsyncAuditLog(new PostgresAuditSink(new FakePool()), fixedClock);
    const r = await runAuditedPipelineAsync(
      { snapshot: makeSnapshot(), gene: 'CYP2D6', now: fixedClock },
      log,
    );
    expect(r.verdict.decision).toBe('recommend');
    expect((await log.verify()).valid).toBe(true);
    const events = (await log.entries()).map((e) => e.event_type);
    expect(events).toContain('verdict.recorded');
  });
});
