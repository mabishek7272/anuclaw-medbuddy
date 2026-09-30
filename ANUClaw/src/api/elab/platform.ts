/**
 * Default E-LAB platform wiring (Phase 0, final wiring).
 *
 * Builds the platform dependencies for mounting in the API server and resolves
 * a `TenantContext` from the authenticated request. Safe-by-default: a tenant
 * without explicit grants gets `ruo` scope only and no BAA, so the Clinical tier
 * is denied until a tenant is explicitly granted `clinical` + an active BAA +
 * enabled domains (those tenant fields/admin path are a later step).
 *
 * NOTE: the default per-tenant audit is in-memory (per process). A durable,
 * Postgres-backed per-tenant audit sink is an interface-compatible drop-in.
 * Engines (e.g. AutoDock Vina, WS-A2) register into the registry as their
 * adapters are built; until then `/v1/ruo/:engineId` returns 404 for unknowns.
 */

import { Request } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ElabDeps } from './service';
import { TenantContext } from './types';
import { EngineRegistry, JobRuntime, VinaDockingEngine } from '../../engines';
import { OncologyCombinationModule } from '../../cds/clinical';
import { PerTenantAuditLog } from '../../cds';

export function createDefaultElabPlatform(): ElabDeps {
  const registry = new EngineRegistry();
  // Real RUO engine: AutoDock Vina docking (runs in the anuclaw-vina container).
  // validated=false ⇒ RUO-only / Clinical fail-closed. More engines register here
  // as their adapters are built.
  registry.register(new VinaDockingEngine());
  const jobs = new JobRuntime(registry);
  return {
    registry,
    jobs,
    oncology: new OncologyCombinationModule(),
    audit: new PerTenantAuditLog(),
  };
}

export function resolveTenantContext(req: Request): TenantContext | null {
  const tenant = (req as AuthRequest).tenant;
  if (!tenant) return null;
  return {
    tenant_id: tenant.tenant_id,
    scopes: tenant.scopes ?? ['ruo'],
    baa_active: tenant.baa_status === 'active',
    allowed_clinical_domains: tenant.allowed_clinical_domains ?? [],
    residency: tenant.residency ?? 'us',
  };
}
