/**
 * ANUClaw E-LAB — Engine layer: the adapter contract (Phase 0, WS-A1).
 *
 * Per the platform design (`docs/ELAB_Clinical_Engine_Platform_Design.md`) and
 * gate specs, an engine is a typed, version-pinned, **deterministic** service —
 * NOT an LLM/agent. Adapters wrap a real tool (Vina, an ODE solver, an ML model)
 * behind a single async contract whose output is structured and reproducibility-
 * classified, and whose input has a canonical, stable hash (used for the audit
 * trail and the content-addressed job cache).
 *
 * This module deliberately imports only `src/cds/hashing` (a pure canonical-hash
 * util) so the engine layer carries no LLM/agent dependency.
 */

import { contentHash } from '../cds/hashing';

/** How reproducible an engine's output is (gate spec Spec 4). */
export type ReproducibilityClass =
  /** Same input + version ⇒ identical output (CDS core, RDKit, PK/PD ODE). */
  | 'deterministic'
  /** Reproducible given the recorded seed AND pinned hardware/image (MD). */
  | 'seed_reproducible_pinned_hw'
  /** A point-in-time snapshot; not re-derivable (external API, e.g. AlphaFold). */
  | 'snapshot_only_external';

/** Structured failure taxonomy so the job runtime can react deterministically. */
export type EngineErrorCode = 'invalid_input' | 'timeout' | 'crashed' | 'unavailable';

export class EngineError extends Error {
  constructor(
    public readonly code: EngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

/** A content-addressed reference to a produced artifact (pose, trajectory…). */
export interface ArtifactRef {
  id: string;
  kind: string; // 'pose' | 'trajectory' | 'structure' | 'report' | …
  /** Content hash of the artifact bytes (audit + reproducibility). */
  hash: string;
  bytes?: number;
}

/** Everything needed to reproduce/attribute an engine run (gate Spec 4). */
export interface EngineProvenance {
  tool: string;
  tool_version: string;
  params: Record<string, unknown>;
  /** Container image digest the tool ran in (when applicable). */
  container_digest?: string;
  /** Reference-data versions that influence the result (fold into cache key). */
  refdb_versions?: Record<string, string>;
}

export interface EngineResult<Out> {
  engine_id: string;
  engine_version: string;
  /** Canonical hash of the typed input (stable across key ordering). */
  input_hash: string;
  output: Out;
  /** Present for probabilistic engines (ML). Evidence only — never decides. */
  confidence?: number;
  /** Recorded for stochastic engines (MD) so a run is re-runnable. */
  seed?: number;
  artifacts: ArtifactRef[];
  provenance: EngineProvenance;
  reproducibility_class: ReproducibilityClass;
  started_at: string;
  finished_at: string;
}

export interface RunContext {
  /** Caller-supplied idempotency key; defaults to `input_hash` if omitted. */
  idempotencyKey?: string;
  /** Cooperative cancellation (job timeout/cancel). */
  signal?: AbortSignal;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
}

/**
 * The one contract every engine implements. Async + serializable I/O so the
 * same contract works in-process now and across a service boundary later
 * (the clean seam to "Approach C").
 */
export interface EngineAdapter<In, Out> {
  readonly id: string;
  readonly version: string;
  /** Is THIS engine version cleared for the Clinical tier? (fail-closed gate) */
  readonly validated: boolean;
  readonly reproducibility_class: ReproducibilityClass;
  run(input: In, ctx?: RunContext): Promise<EngineResult<Out>>;
}

/**
 * Canonical, stable hash of a typed engine input — order-independent, so it is
 * safe as a reproducibility key and as part of the content-addressed cache key.
 */
export function hashEngineInput(
  engineId: string,
  engineVersion: string,
  input: unknown,
): string {
  return contentHash({ engineId, engineVersion, input });
}

/** ISO timestamp from an optional injected clock (deterministic in tests). */
export function nowIso(now?: () => Date): string {
  return (now ? now() : new Date()).toISOString();
}
