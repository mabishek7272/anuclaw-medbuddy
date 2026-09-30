import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { incrementUsage, logApiCall } from '../tenant-store';
import { logger } from '../../logger';

/**
 * Wraps res.json to capture the final status code, then logs and meters the call.
 * Must be placed AFTER requireAuth and quotaCheck in the middleware chain.
 */
export function usageMeter(req: AuthRequest, res: Response, next: NextFunction): void {
  const tenant = req.tenant;
  if (!tenant) { next(); return; }

  const start = Date.now();
  const originalJson = res.json.bind(res);

  res.json = (body: unknown) => {
    const latency = Date.now() - start;
    const skill = (req.params as Record<string, string>).skill ?? undefined;

    incrementUsage(tenant.tenant_id).catch(err => {
      logger.error(`Error incrementing usage for tenant ${tenant.tenant_id}:`, err);
    });

    logApiCall({
      tenant_id:   tenant.tenant_id,
      endpoint:    `${req.method} ${req.path}`,
      skill,
      status_code: res.statusCode,
      latency_ms:  latency,
    }).catch(err => {
      logger.error(`Error logging API call for tenant ${tenant.tenant_id}:`, err);
    });

    return originalJson(body);
  };

  next();
}
