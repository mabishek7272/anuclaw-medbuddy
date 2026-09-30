/**
 * Async job runtime (Phase 0, WS-B).
 *
 * Executes an engine for a (tenant, tier) request with:
 *  - **Clinical fail-closed gating** (unvalidated engine → job fails, no result),
 *  - **content-addressed caching** partitioned by tenant + tier,
 *  - **in-flight dedup** (concurrent identical requests run the engine once),
 *  - **timeout → `timed_out`, fail-closed** (never a partial/guessed result).
 *
 * P0 executes inline (await) and stores the finished job; the HTTP 202 + poll/SSE/
 * webhook delivery is the API layer's concern. The worker-pool/queue is a later
 * scale concern with the same interface.
 */

import * as crypto from 'crypto';
import { EngineError, EngineResult, hashEngineInput, nowIso } from '../types';
import { EngineNotValidatedError, EngineRegistry } from '../registry';
import { cacheKey, InMemoryResultCache } from './cache';
import {
  JobRecord,
  JobStore,
  ResultCache,
  SubmitRequest,
} from './types';

class InMemoryJobStore implements JobStore {
  private readonly jobs = new Map<string, JobRecord>();
  put(job: JobRecord): void {
    this.jobs.set(job.id, job);
  }
  get(id: string): JobRecord | undefined {
    return this.jobs.get(id);
  }
  list(tenantId: string): JobRecord[] {
    return [...this.jobs.values()].filter((j) => j.tenant_id === tenantId);
  }
}

export interface JobRuntimeOptions {
  cache?: ResultCache;
  store?: JobStore;
  now?: () => Date;
  /** Default per-job timeout (ms). */
  defaultTimeoutMs?: number;
}

export class JobRuntime {
  private readonly cache: ResultCache;
  private readonly store: JobStore;
  private readonly now: () => Date;
  private readonly defaultTimeoutMs: number;
  /** key → in-flight execution, for thundering-herd dedup. */
  private readonly inflight = new Map<string, Promise<EngineResult<unknown>>>();

  constructor(
    private readonly registry: EngineRegistry,
    opts: JobRuntimeOptions = {},
  ) {
    this.cache = opts.cache ?? new InMemoryResultCache();
    this.store = opts.store ?? new InMemoryJobStore();
    this.now = opts.now ?? (() => new Date());
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? 120_000;
  }

  getJob(id: string): JobRecord | undefined {
    return this.store.get(id);
  }

  listJobs(tenantId: string): JobRecord[] {
    return this.store.list(tenantId);
  }

  async submit<In, Out>(req: SubmitRequest<In>): Promise<JobRecord<Out>> {
    // Tier gating — fail-closed for Clinical (and validation errors before any run).
    let engine;
    try {
      engine =
        req.tier === 'clinical'
          ? this.registry.forClinical(req.engineId)
          : this.registry.forRuo(req.engineId);
    } catch (err) {
      return this.failedJob<Out>(req, '', {
        code: err instanceof EngineNotValidatedError ? 'engine_not_validated' : 'unknown_engine',
        message: err instanceof Error ? err.message : String(err),
      });
    }

    const input_hash = hashEngineInput(req.engineId, engine.version, req.input);
    const key = cacheKey({
      tenant_id: req.tenant_id,
      tier: req.tier,
      engine_id: req.engineId,
      engine_version: engine.version,
      input_hash,
      refdb_hashes: req.refdb_hashes,
    });

    const base = {
      id: crypto.randomUUID(),
      tenant_id: req.tenant_id,
      tier: req.tier,
      engine_id: req.engineId,
      engine_version: engine.version,
      input_hash,
      queued_at: nowIso(this.now),
    };

    // Cache hit → no engine run.
    const cached = this.cache.get(key);
    if (cached) {
      const job: JobRecord<Out> = {
        ...base,
        status: 'succeeded',
        cached: true,
        result: cached as EngineResult<Out>,
        started_at: base.queued_at,
        finished_at: nowIso(this.now),
      };
      this.store.put(job);
      return job;
    }

    const started_at = nowIso(this.now);
    try {
      // In-flight dedup: concurrent identical requests await one execution.
      let exec = this.inflight.get(key);
      if (!exec) {
        exec = this.withTimeout(
          engine.run(req.input, { idempotencyKey: key, now: this.now }),
          req.timeoutMs ?? this.defaultTimeoutMs,
        );
        this.inflight.set(key, exec);
        exec.finally(() => this.inflight.delete(key)).catch(() => {});
      }
      const result = (await exec) as EngineResult<Out>;
      this.cache.set(key, result as EngineResult<unknown>);
      const job: JobRecord<Out> = {
        ...base,
        status: 'succeeded',
        cached: false,
        result,
        started_at,
        finished_at: nowIso(this.now),
      };
      this.store.put(job);
      return job;
    } catch (err) {
      const code = err instanceof EngineError ? err.code : 'crashed';
      const status = code === 'timeout' ? 'timed_out' : 'failed';
      const job: JobRecord<Out> = {
        ...base,
        status,
        cached: false,
        error: { code, message: err instanceof Error ? err.message : String(err) },
        started_at,
        finished_at: nowIso(this.now),
      };
      this.store.put(job); // fail-closed: no result attached
      return job;
    }
  }

  private failedJob<Out>(
    req: SubmitRequest,
    engineVersion: string,
    error: { code: string; message: string },
  ): JobRecord<Out> {
    const ts = nowIso(this.now);
    const job: JobRecord<Out> = {
      id: crypto.randomUUID(),
      tenant_id: req.tenant_id,
      tier: req.tier,
      engine_id: req.engineId,
      engine_version: engineVersion,
      input_hash: '',
      status: 'failed',
      cached: false,
      error,
      queued_at: ts,
      started_at: ts,
      finished_at: ts,
    };
    this.store.put(job);
    return job;
  }

  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    if (!Number.isFinite(ms) || ms <= 0) return p;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new EngineError('timeout', `engine exceeded ${ms}ms`)),
        ms,
      );
      p.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }
}

export { InMemoryJobStore };
