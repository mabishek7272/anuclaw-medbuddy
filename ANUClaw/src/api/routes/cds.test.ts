import { describe, it, expect } from 'vitest';
import { createCdsRouter } from './cds';
import {
  PgPoolLike,
  PgQueryResult,
  PostgresAuditSink,
  AsyncAuditLog,
  evaluateRequest,
  eventInputsFor,
} from '../../cds';
import { DEMO_REQUEST } from '../../cds';

/** In-memory fake of the app's pg pool. */
class FakePool implements PgPoolLike {
  rows: Array<Record<string, unknown>> = [];
  async query(text: string, params?: unknown[]): Promise<PgQueryResult> {
    if (/^\s*(CREATE|DROP)/i.test(text)) return { rows: [] };
    if (/INSERT INTO/i.test(text)) {
      const [seq, timestamp, actor, event_type, payload, prev_hash, entry_hash] = params!;
      this.rows.push({ seq, timestamp, actor, event_type, payload, prev_hash, entry_hash });
      return { rows: [] };
    }
    if (/ORDER BY seq DESC/i.test(text)) {
      const s = [...this.rows].sort((a, b) => Number(b.seq) - Number(a.seq));
      return { rows: s.slice(0, 1) };
    }
    if (/ORDER BY seq ASC/i.test(text)) {
      return { rows: [...this.rows].sort((a, b) => Number(a.seq) - Number(b.seq)) };
    }
    return { rows: [] };
  }
}

describe('CDS API router wiring', () => {
  it('constructs with an injected pool (never touches getDb)', () => {
    const router = createCdsRouter({ pool: new FakePool() });
    expect(typeof router).toBe('function'); // an Express router is a middleware fn
  });

  it('persists a verifiable audit chain for the demo order (router core path)', async () => {
    // Mirror exactly what the route handler does, over the fake pool.
    const pool = new FakePool();
    const sink = new PostgresAuditSink(pool);
    await sink.ensureSchema();
    const log = new AsyncAuditLog(sink);

    const items = await evaluateRequest(DEMO_REQUEST, {});
    expect(items.map((i) => i.verdict.decision)).toEqual(['recommend', 'block']);

    for (const item of items) {
      for (const input of eventInputsFor(
        item.verdict,
        item.explanation,
        item.trace,
        item.gene,
        'demo-patient-001',
      )) {
        await log.record(input);
      }
    }

    expect((await log.verify()).valid).toBe(true);
    const events = (await log.entries()).map((e) => e.event_type);
    expect(events.filter((e) => e === 'verdict.recorded')).toHaveLength(2);
  });

  it('a clinician sign-off chains onto the same Postgres-backed log', async () => {
    const log = new AsyncAuditLog(new PostgresAuditSink(new FakePool()));
    await log.record({ actor: 'system:arbitrator', event_type: 'verdict.recorded', payload: { verdict_hash: 'h' } });
    const entry = await log.signOff({ verdict_hash: 'h', clinician: { id: 'dr-ng' }, action: 'accept' });
    expect(entry.actor).toBe('clinician:dr-ng');
    expect((await log.verify()).valid).toBe(true);
  });
});
