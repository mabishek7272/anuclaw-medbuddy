/**
 * E-LAB platform API — shared types (Phase 0, WS-C/D).
 *
 * Tenant context resolved from auth and enforced at the tier gate. The platform
 * endpoints are framework-agnostic; the Express adapter supplies a resolver.
 */

import { Tier } from '../../engines';

export interface TenantContext {
  tenant_id: string;
  /** Granted API scopes: 'ruo' and/or 'clinical'. */
  scopes: string[];
  /** Server-side BAA status (NOT a token claim) — gates the Clinical tier. */
  baa_active: boolean;
  /** Clinical domains enabled for this tenant (per-domain validation gating). */
  allowed_clinical_domains: string[];
  residency: string; // 'us' | 'eu' | …
}

export interface GateResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export interface ServiceResponse {
  status: number;
  body: unknown;
}

export type { Tier };
