import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getTenantByApiKey, getTenantById, Tenant } from '../tenant-store';

const JWT_SECRET = process.env.ANUCLAW_JWT_SECRET ?? 'change-me-in-production';
const JWT_EXPIRES_IN = '1h';

export interface AuthRequest extends Request {
  tenant?: Tenant;
}

// ── JWT helpers ───────────────────────────────────────────────────────────────

export function signToken(tenantId: string): string {
  return jwt.sign({ sub: tenantId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token: string): { sub: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { sub: string };
  } catch {
    return null;
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * Accepts either:
 *   Authorization: Bearer <jwt>
 *   X-API-Key: amgi_live_<key>
 *
 * Attaches req.tenant on success.
 */
export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  // 1. JWT bearer token
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token.' });
      return;
    }
    const tenant = await getTenantById(payload.sub);
    if (!tenant || tenant.status !== 'active') {
      res.status(401).json({ error: 'Tenant not found or suspended.' });
      return;
    }
    req.tenant = tenant;
    next();
    return;
  }

  // 2. API key header
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (apiKey) {
    const tenant = await getTenantByApiKey(apiKey);
    if (!tenant || tenant.status !== 'active') {
      res.status(401).json({ error: 'Invalid API key or account suspended.' });
      return;
    }
    req.tenant = tenant;
    next();
    return;
  }

  res.status(401).json({
    error: 'Authentication required.',
    hint: 'Provide X-API-Key header or Authorization: Bearer <token>',
  });
}
