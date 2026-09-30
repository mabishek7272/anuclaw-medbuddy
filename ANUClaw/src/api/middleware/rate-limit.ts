import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

/**
 * Rate limiting and quota enforcement are intentionally disabled.
 * All tenants have unlimited usage — no caps on calls per minute or per month.
 *
 * These middleware functions are kept as pass-through stubs so the route
 * definitions don't need to change when limits are re-enabled in future.
 */

export function perTenantRateLimit(req: AuthRequest, res: Response, next: NextFunction): void {
  // No rate limiting — unlimited requests
  next();
}

export function quotaCheck(req: AuthRequest, res: Response, next: NextFunction): void {
  // No quota enforcement — unlimited monthly usage
  next();
}
