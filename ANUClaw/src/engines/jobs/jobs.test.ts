import { describe, it, expect } from 'vitest';
import { JobRuntime } from './runtime';
import { cacheKey } from './cache';
import { EngineRegistry } from '../registry';
import {
  EngineAdapter,
  EngineResult,
  RunContext,
  hashEngineInput,
  nowIso,
} from '../types';

interface CInput {
  v: string;
}

/** A counting test engine (optionally slow / never-resolving / unvalidated). */
function countingEngine(opts: { validated?: boolean; delayMs?: number; neverResolve?: boolean } = {}) {
  let runs = 0;
  const id = 'count';
  const version = '1.0.0';
  const engine: EngineAdapter<CInput, CInput> = {
    id,
    version,
    validated: opts.validated ?? true,
    reproducibility_class: 'deterministic',
    async run(input: CInput, ctx?: RunContext): Promise<EngineResult<CInput>> {
      runs += 1;
      if (opts.neverResolve) return new Promise<EngineResult<CInput>>(() => {});
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      const ts = nowIso(ctx?.now);
      return {
        engine_id: id,
        engine_version: version,
        input_hash: hashEngineInput(id, version, input),
        output: { v: input.v },
        artifacts: [],
        provenance: { tool: id, tool_version: version, params: {} },
        reproducibility_class: 'deterministic',
        started_at: ts,
        finished_at: ts,
      };
    },
  };
  return { engine, runs: () => runs };
}

function runtimeWith(engine: EngineAdapter<unknown, unknown>): JobRuntime {
  const reg = new EngineRegistry();
  reg.register(engine);
  return new JobRuntime(reg, { defaultTimeoutMs: 1000 });
}

describe('job runtime — cache & isolation (WS-B)', () => {
  it('runs once then serves from cache for an identical request', async () => {
    const c = countingEngine();
    const rt = runtimeWith(c.engine as EngineAdapter<unknown, unknown>);
    const req = { tenant_id: 't1', tier: 'ruo' as const, engineId: 'count', input: { v: 'x' } };

    const j1 = await rt.submit<CInput, CInput>(req);
    const j2 = await rt.submit<CInput, CInput>(req);

    expect(j1.status).toBe('succeeded');
    expect(j1.cached).toBe(false);
    expect(j2.cached).toBe(true); // served from cache
    expect(c.runs()).toBe(1); // engine ran exactly once
    expect(j2.result?.output).toEqual({ v: 'x' });
  });

  it('cross-tenant isolation: same input, different tenant ⇒ cache miss', async () => {
    const c = countingEngine();
    const rt = runtimeWith(c.engine as EngineAdapter<unknown, unknown>);
    await rt.submit({ tenant_id: 't1', tier: 'ruo', engineId: 'count', input: { v: 'x' } });
    const j2 = await rt.submit({ tenant_id: 't2', tier: 'ruo', engineId: 'count', input: { v: 'x' } });
    expect(j2.cached).toBe(false);
    expect(c.runs()).toBe(2); // ran again for the other tenant
  });

  it('cache key is partitioned by tenant and tier', () => {
    const base = { engine_id: 'count', engine_version: '1.0.0', input_hash: 'h' };
    const k1 = cacheKey({ tenant_id: 't1', tier: 'ruo', ...base });
    const k2 = cacheKey({ tenant_id: 't2', tier: 'ruo', ...base });
    const k3 = cacheKey({ tenant_id: 't1', tier: 'clinical', ...base });
    expect(k1).not.toBe(k2); // tenant
    expect(k1).not.toBe(k3); // tier
  });

  it('dedups concurrent identical requests (engine runs once)', async () => {
    const c = countingEngine({ delayMs: 30 });
    const rt = runtimeWith(c.engine as EngineAdapter<unknown, unknown>);
    const req = { tenant_id: 't1', tier: 'ruo' as const, engineId: 'count', input: { v: 'x' } };
    const [a, b] = await Promise.all([rt.submit(req), rt.submit(req)]);
    expect(a.status).toBe('succeeded');
    expect(b.status).toBe('succeeded');
    expect(c.runs()).toBe(1); // thundering-herd dedup
  });
});

describe('job runtime — fail-closed (WS-B)', () => {
  it('Clinical tier fails closed for an unvalidated engine (no result)', async () => {
    const c = countingEngine({ validated: false });
    const rt = runtimeWith(c.engine as EngineAdapter<unknown, unknown>);
    const job = await rt.submit({ tenant_id: 't1', tier: 'clinical', engineId: 'count', input: { v: 'x' } });
    expect(job.status).toBe('failed');
    expect(job.error?.code).toBe('engine_not_validated');
    expect(job.result).toBeUndefined();
    expect(c.runs()).toBe(0); // never executed
  });

  it('times out fail-closed (status timed_out, no result)', async () => {
    const c = countingEngine({ neverResolve: true });
    const reg = new EngineRegistry();
    reg.register(c.engine as EngineAdapter<unknown, unknown>);
    const rt = new JobRuntime(reg, { defaultTimeoutMs: 40 });
    const job = await rt.submit({ tenant_id: 't1', tier: 'ruo', engineId: 'count', input: { v: 'x' } });
    expect(job.status).toBe('timed_out');
    expect(job.error?.code).toBe('timeout');
    expect(job.result).toBeUndefined();
  });

  it('records and retrieves jobs per tenant', async () => {
    const c = countingEngine();
    const rt = runtimeWith(c.engine as EngineAdapter<unknown, unknown>);
    const job = await rt.submit({ tenant_id: 't9', tier: 'ruo', engineId: 'count', input: { v: 'z' } });
    expect(rt.getJob(job.id)?.id).toBe(job.id);
    expect(rt.listJobs('t9').map((j) => j.id)).toContain(job.id);
    expect(rt.listJobs('other')).toHaveLength(0);
  });
});
