/**
 * Admin API — tenant clinical-grant management (ops follow-up).
 *
 *   GET  /api/v1/admin/tenants/:id                 inspect a tenant's tiering
 *   POST /api/v1/admin/tenants/:id/clinical-grant  enable clinical scope + BAA + domains
 *   POST /api/v1/admin/tenants/:id/baa             set BAA status
 *
 * Auth: `X-Admin-Key` header must equal `ADMIN_API_KEY`. FAIL-CLOSED — if no
 * admin key is configured the entire admin API returns 503 (never open).
 * The guard is a pure factory so it is unit-tested without HTTP.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { grantClinicalAccess, setBaaStatus, getTenantById } from '../tenant-store';

const BAA_STATUSES = ['none', 'active', 'expired'] as const;

export function requireAdmin(adminKey: string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!adminKey) {
      res.status(503).json({ error: 'Admin API is disabled (set ADMIN_API_KEY to enable).' });
      return;
    }
    const provided = req.header('x-admin-key');
    if (!provided || provided !== adminKey) {
      res.status(401).json({ error: 'Invalid or missing X-Admin-Key.' });
      return;
    }
    next();
  };
}

export interface AdminRouterOptions {
  adminKey?: string;
}

export function createAdminRouter(opts: AdminRouterOptions = {}): Router {
  const adminKey = opts.adminKey ?? process.env.ADMIN_API_KEY;
  const guard = requireAdmin(adminKey);
  const router = Router();
  const fail = (res: Response, code: number, error: string, detail?: string) =>
    res.status(code).json(detail ? { error, detail } : { error });

  router.get('/api/v1/admin/tenants/:id', guard, async (req: Request, res: Response) => {
    try {
      const t = await getTenantById(String(req.params.id));
      if (!t) return fail(res, 404, 'tenant not found');
      res.json({
        tenant_id: t.tenant_id,
        scopes: t.scopes ?? [],
        baa_status: t.baa_status ?? 'none',
        residency: t.residency ?? 'us',
        allowed_clinical_domains: t.allowed_clinical_domains ?? [],
      });
    } catch (e) {
      fail(res, 500, 'lookup failed', msg(e));
    }
  });

  router.post('/api/v1/admin/tenants/:id/clinical-grant', guard, async (req: Request, res: Response) => {
    const domains = Array.isArray(req.body?.domains) ? (req.body.domains as string[]) : [];
    if (!domains.length) return fail(res, 400, 'domains[] is required');
    try {
      await grantClinicalAccess(String(req.params.id), domains, { residency: req.body?.residency });
      const t = await getTenantById(String(req.params.id));
      res.json({
        ok: true,
        tenant_id: String(req.params.id),
        scopes: t?.scopes,
        baa_status: t?.baa_status,
        allowed_clinical_domains: t?.allowed_clinical_domains,
      });
    } catch (e) {
      fail(res, 500, 'grant failed', msg(e));
    }
  });

  router.post('/api/v1/admin/tenants/:id/baa', guard, async (req: Request, res: Response) => {
    const status = req.body?.status;
    if (!BAA_STATUSES.includes(status)) {
      return fail(res, 400, `status must be one of: ${BAA_STATUSES.join(', ')}`);
    }
    try {
      await setBaaStatus(String(req.params.id), status);
      res.json({ ok: true, tenant_id: String(req.params.id), baa_status: status });
    } catch (e) {
      fail(res, 500, 'update failed', msg(e));
    }
  });

  return router;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
