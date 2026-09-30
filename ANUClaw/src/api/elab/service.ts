/**
 * E-LAB platform service (Phase 0, WS-D) — framework-agnostic handlers.
 *
 * Wires the engine registry + job runtime (RUO) and the oncology
 * ClinicalDecisionModule (Clinical) to tenant-gated, per-tenant-audited
 * endpoints. Every response is tier-labelled. Clinical verdicts are recorded to
 * the per-tenant audit chain BEFORE the response is returned — an audit-write
 * failure yields 500 and NO verdict (completeness, plan §3.2).
 */

import { EngineRegistry, JobRuntime } from '../../engines';
import { PerTenantAuditLog } from '../../cds';
import {
  ClinicalDecisionModule,
  OncologyCombinationModule,
  OncologyContext,
  OncologyQuery,
  SupportingEvidenceItem,
} from '../../cds/clinical';
import { checkClinicalGate, checkRuoGate } from './gate';
import { checkRuoInput } from './de-id';
import { ServiceResponse, TenantContext } from './types';

export interface ElabDeps {
  registry: EngineRegistry;
  jobs: JobRuntime;
  oncology: OncologyCombinationModule;
  audit: PerTenantAuditLog;
}

const RUO_LABEL = 'RUO — not for diagnostic use';

function err(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface RuoRequest {
  engineId: string;
  input: unknown;
  refdb_hashes?: string[];
}

export async function runRuo(
  deps: ElabDeps,
  ctx: TenantContext,
  req: RuoRequest,
): Promise<ServiceResponse> {
  const gate = checkRuoGate(ctx);
  if (!gate.ok) return { status: gate.status!, body: { error: gate.error } };

  // Enforce de-identification (genomic/identifiers → use the Clinical tier).
  const deid = checkRuoInput(req.input);
  if (!deid.ok) {
    return {
      status: 400,
      body: {
        error: 'RUO input rejected: not de-identified',
        detail: deid.reason,
        hint: 'patient-identifiable or genomic data must use the Clinical tier under a BAA',
      },
    };
  }

  if (!deps.registry.has(req.engineId)) {
    return { status: 404, body: { error: `unknown engine '${req.engineId}'` } };
  }

  const job = await deps.jobs.submit({
    tenant_id: ctx.tenant_id,
    tier: 'ruo',
    engineId: req.engineId,
    input: req.input,
    refdb_hashes: req.refdb_hashes,
  });

  try {
    deps.audit.record(ctx.tenant_id, {
      actor: `tenant:${ctx.tenant_id}`,
      event_type: 'ruo.run',
      payload: { engine_id: req.engineId, status: job.status, input_hash: job.input_hash, cached: job.cached },
    });
  } catch (e) {
    return { status: 500, body: { error: 'audit write failed; no output emitted', detail: err(e) } };
  }

  if (job.status !== 'succeeded') {
    return { status: 502, body: { regulatory: RUO_LABEL, tier: 'ruo', job } };
  }
  return {
    status: 200,
    body: { regulatory: RUO_LABEL, tier: 'ruo', job_id: job.id, cached: job.cached, result: job.result },
  };
}

export interface ClinicalCombinationRequest {
  query: OncologyQuery;
  context: OncologyContext;
  supporting?: SupportingEvidenceItem[];
}

export interface ClinicalDecisionRequest {
  query: unknown;
  context: unknown;
  supporting?: SupportingEvidenceItem[];
}

/**
 * Domain-agnostic clinical decision runner: gate (scope + BAA + domain) →
 * module.decide → record to the per-tenant audit chain BEFORE emitting (an
 * audit-write failure yields 500 and NO verdict). Any ClinicalDecisionModule
 * (oncology, neurology, …) plugs in unchanged.
 */
export function runClinicalDecision(
  module: ClinicalDecisionModule<any, any>,
  ctx: TenantContext,
  audit: PerTenantAuditLog,
  req: ClinicalDecisionRequest,
): ServiceResponse {
  const gate = checkClinicalGate(ctx, module.domain);
  if (!gate.ok) return { status: gate.status!, body: { error: gate.error } };

  const verdict = module.decide(req.query, req.context, { supporting: req.supporting });

  try {
    audit.record(ctx.tenant_id, {
      actor: 'system:arbitrator',
      event_type: 'verdict.recorded',
      payload: verdict,
    });
  } catch (e) {
    return { status: 500, body: { error: 'audit write failed; no clinical output emitted', detail: err(e) } };
  }

  return {
    status: 200,
    body: {
      tier: 'clinical',
      regulatory: 'clinical',
      verdict,
      audit: { tenant_id: ctx.tenant_id, verdict_hash: verdict.verdict_hash },
    },
  };
}

export function runClinicalDrugCombination(
  deps: ElabDeps,
  ctx: TenantContext,
  req: ClinicalCombinationRequest,
): ServiceResponse {
  return runClinicalDecision(deps.oncology, ctx, deps.audit, req);
}
