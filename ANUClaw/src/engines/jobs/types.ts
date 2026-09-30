/**
 * Async job runtime — types (Phase 0, WS-B).
 *
 * Heavy engines never block the caller: work is submitted as a job, executed,
 * cached (content-addressed, partitioned by tenant + tier), and the result is
 * delivered by poll/SSE/webhook at the API layer. P0 ships an in-memory store +
 * cache; a Postgres-backed store is a later, interface-compatible drop-in.
 */

import { EngineResult } from '../types';

export type Tier = 'ruo' | 'clinical';

export type JobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'timed_out'
  | 'cancelled';

export interface JobError {
  code: string; // EngineErrorCode or 'engine_not_validated' | …
  message: string;
}

export interface JobRecord<Out = unknown> {
  id: string;
  tenant_id: string;
  tier: Tier;
  engine_id: string;
  engine_version: string;
  input_hash: string;
  status: JobStatus;
  /** True when served from the content-addressed cache (no engine re-run). */
  cached: boolean;
  result?: EngineResult<Out>;
  error?: JobError;
  queued_at: string;
  started_at?: string;
  finished_at?: string;
}

export interface SubmitRequest<In = unknown> {
  tenant_id: string;
  tier: Tier;
  engineId: string;
  input: In;
  /** Reference-DB content hashes that influence the result (cache-key inputs). */
  refdb_hashes?: string[];
  /** Override the default timeout for this job. */
  timeoutMs?: number;
}

/** Parts that form the content-addressed cache key (tenant + tier partitioned). */
export interface CacheKeyParts {
  tenant_id: string;
  tier: Tier;
  engine_id: string;
  engine_version: string;
  input_hash: string;
  refdb_hashes?: string[];
}

export interface ResultCache {
  get(key: string): EngineResult<unknown> | undefined;
  set(key: string, result: EngineResult<unknown>): void;
}

export interface JobStore {
  put(job: JobRecord): void;
  get(id: string): JobRecord | undefined;
  list(tenantId: string): JobRecord[];
}
