import * as crypto from 'crypto';
import { db } from '../db';
import { logger } from '../logger';
import { mapTenantRow } from './tenant-map';

export type Plan = 'free' | 'pro' | 'enterprise';

export interface Tenant {
  tenant_id: string;
  company_name: string;
  email: string;
  api_key: string;
  plan: Plan;
  rate_limit_per_min: number;
  monthly_quota: number | null;   // null = unlimited
  usage_this_month: number;
  usage_total: number;
  status: 'active' | 'suspended';
  webhook_url: string | null;
  created_at: string;
  last_active_at: string | null;
  // ── E-LAB platform tiering (WS-C1) — optional; safe defaults applied if absent.
  /** Granted API scopes: 'ruo' and/or 'clinical'. Default ['ruo']. */
  scopes?: string[];
  /** Server-side BAA status — gates the Clinical tier. Default 'none'. */
  baa_status?: 'none' | 'active' | 'expired';
  /** Data-residency region pin. Default 'us'. */
  residency?: string;
  /** Clinical domains enabled for this tenant (per-domain validation gating). */
  allowed_clinical_domains?: string[];
}

// All plans are unlimited — no rate limits or quotas enforced.
// These values are stored for record-keeping and future billing; they are not enforced.
const PLAN_LIMITS: Record<Plan, { rate: number; quota: number | null }> = {
  free:       { rate: 0, quota: null },
  pro:        { rate: 0, quota: null },
  enterprise: { rate: 0, quota: null },
};

export function generateApiKey(): string {
  return 'amgi_live_' + crypto.randomBytes(24).toString('hex');
}

export async function registerTenant(
  companyName: string,
  email: string,
  plan: Plan = 'free',
): Promise<Tenant> {
  const existing = await db.queryOne('SELECT tenant_id FROM tenants WHERE email = $1', [email]);
  if (existing) throw new Error(`Email '${email}' is already registered.`);

  const tenant_id = crypto.randomUUID();
  const api_key = generateApiKey();
  const limits = PLAN_LIMITS[plan];
  const now = new Date().toISOString();

  await db.query(`
    INSERT INTO tenants
      (tenant_id, company_name, email, api_key, plan, rate_limit_per_min, monthly_quota, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [tenant_id, companyName, email, api_key, plan, limits.rate, limits.quota ?? null, now]);

  logger.info(`New tenant registered: ${companyName} (${plan}) — ${tenant_id}`);
  const tenant = await getTenantById(tenant_id);
  if (!tenant) throw new Error('Failed to retrieve registered tenant.');
  return tenant;
}

export async function getTenantByApiKey(apiKey: string): Promise<Tenant | null> {
  const row = await db.queryOne<Record<string, unknown>>('SELECT * FROM tenants WHERE api_key = $1', [apiKey]);
  return row ? mapTenantRow(row) : null;
}

export async function getTenantById(tenantId: string): Promise<Tenant | null> {
  const row = await db.queryOne<Record<string, unknown>>('SELECT * FROM tenants WHERE tenant_id = $1', [tenantId]);
  return row ? mapTenantRow(row) : null;
}

/**
 * Grant a tenant Clinical-tier access: enables `clinical` scope, marks the BAA
 * active, and enables the given clinical domains (E-LAB platform, WS-C1). Admin-
 * gated in production. Scopes/domains are stored as JSON text.
 */
export async function grantClinicalAccess(
  tenantId: string,
  domains: string[],
  opts: { residency?: string } = {},
): Promise<void> {
  await db.query(
    `UPDATE tenants
       SET scopes = $1, baa_status = 'active', allowed_clinical_domains = $2,
           residency = COALESCE($3, residency)
     WHERE tenant_id = $4`,
    [JSON.stringify(['ruo', 'clinical']), JSON.stringify(domains), opts.residency ?? null, tenantId],
  );
  logger.info(`Clinical access granted to tenant ${tenantId} for domains: ${domains.join(', ')}`);
}

/** Set a tenant's BAA status (gates the Clinical tier). */
export async function setBaaStatus(
  tenantId: string,
  status: 'none' | 'active' | 'expired',
): Promise<void> {
  await db.query('UPDATE tenants SET baa_status = $1 WHERE tenant_id = $2', [status, tenantId]);
}

export async function incrementUsage(tenantId: string): Promise<void> {
  await db.query(`
    UPDATE tenants
    SET usage_this_month = usage_this_month + 1,
        usage_total      = usage_total + 1,
        last_active_at   = $1
    WHERE tenant_id = $2
  `, [new Date().toISOString(), tenantId]);
}

export async function logApiCall(opts: {
  tenant_id: string;
  endpoint: string;
  skill?: string;
  status_code: number;
  latency_ms: number;
  tokens_used?: number;
}): Promise<void> {
  await db.query(`
    INSERT INTO api_usage_log (tenant_id, endpoint, skill, status_code, latency_ms, tokens_used, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [
    opts.tenant_id, opts.endpoint, opts.skill ?? null,
    opts.status_code, opts.latency_ms, opts.tokens_used ?? null,
    new Date().toISOString(),
  ]);
}

export async function getUsageStats(tenantId: string): Promise<object> {
  const tenant = await getTenantById(tenantId);
  if (!tenant) throw new Error('Tenant not found');

  const daily = await db.query(`
    SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS calls
    FROM api_usage_log
    WHERE tenant_id = $1 AND created_at >= TO_CHAR(NOW() - INTERVAL '30 days', 'YYYY-MM-DD')
    GROUP BY day ORDER BY day DESC
  `, [tenantId]);

  const bySkill = await db.query(`
    SELECT skill, COUNT(*) AS calls
    FROM api_usage_log
    WHERE tenant_id = $1 AND skill IS NOT NULL
    GROUP BY skill ORDER BY calls DESC LIMIT 10
  `, [tenantId]);

  return {
    tenant_id:         tenant.tenant_id,
    company_name:      tenant.company_name,
    plan:              tenant.plan,
    usage_this_month:  tenant.usage_this_month,
    monthly_quota:     'unlimited',
    usage_total:       tenant.usage_total,
    rate_limit_per_min: tenant.rate_limit_per_min,
    status:            tenant.status,
    last_active_at:    tenant.last_active_at,
    daily_breakdown:   daily,
    top_skills:        bySkill,
  };
}

export async function setWebhook(tenantId: string, url: string): Promise<void> {
  await db.query('UPDATE tenants SET webhook_url = $1 WHERE tenant_id = $2', [url, tenantId]);
}

export async function updatePlan(tenantId: string, plan: Plan): Promise<void> {
  const limits = PLAN_LIMITS[plan];
  await db.query(`
    UPDATE tenants SET plan = $1, rate_limit_per_min = $2, monthly_quota = $3 WHERE tenant_id = $4
  `, [plan, limits.rate, limits.quota ?? null, tenantId]);
}
