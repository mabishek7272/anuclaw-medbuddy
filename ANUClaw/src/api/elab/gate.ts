/**
 * Tier gates (Phase 0, WS-C4) — fail-closed.
 *
 * RUO needs the `ruo` scope (Clinical tenants may also use RUO). Clinical needs
 * the `clinical` scope AND an active BAA AND the specific domain enabled — every
 * condition required, any miss → 403 (no compute).
 */

import { GateResult, TenantContext } from './types';

export function checkRuoGate(ctx: TenantContext): GateResult {
  if (!ctx.scopes.includes('ruo') && !ctx.scopes.includes('clinical')) {
    return { ok: false, status: 403, error: 'missing required scope: ruo' };
  }
  return { ok: true };
}

export function checkClinicalGate(ctx: TenantContext, domain: string): GateResult {
  if (!ctx.scopes.includes('clinical')) {
    return { ok: false, status: 403, error: 'missing required scope: clinical' };
  }
  if (!ctx.baa_active) {
    return { ok: false, status: 403, error: 'no active BAA on file for this tenant' };
  }
  if (!ctx.allowed_clinical_domains.includes(domain)) {
    return { ok: false, status: 403, error: `clinical domain '${domain}' is not enabled for this tenant` };
  }
  return { ok: true };
}
