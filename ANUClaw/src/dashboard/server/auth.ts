import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { db } from '../../db';

const SECRET = process.env.DASHBOARD_JWT_SECRET ?? process.env.ANUCLAW_JWT_SECRET ?? 'dashboard-secret-change-me';
const ACCESS_TTL  = 15 * 60;       // 15 min
const REFRESH_TTL = 7 * 24 * 3600; // 7 days

export interface DashUser {
  id: string;
  email: string;
  name: string | null;
  role: 'admin' | 'operator' | 'viewer' | 'auditor' | 'compliance';
  scope_json: string;
}

export interface AuthRequest extends Request {
  user?: DashUser;
}

export async function issueTokens(userId: string): Promise<{ accessToken: string; refreshToken: string }> {
  const jti = crypto.randomUUID();
  const accessToken  = jwt.sign({ sub: userId, jti, type: 'access'  }, SECRET, { expiresIn: ACCESS_TTL });
  const refreshToken = jwt.sign({ sub: userId, jti, type: 'refresh' }, SECRET, { expiresIn: REFRESH_TTL });

  await db.query(`
    INSERT INTO dash_sessions (jti, user_id, expires_at, ip) VALUES ($1, $2, $3, 'local')
  `, [jti, userId, Date.now() + REFRESH_TTL * 1000]);

  return { accessToken, refreshToken };
}

export async function requireDashAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const token =
    (req.cookies?.dash_token as string | undefined) ??
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined);

  if (!token) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }

  try {
    const payload = jwt.verify(token, SECRET) as { sub: string; jti: string; type: string };
    if (payload.type !== 'access') throw new Error('Wrong token type');

    const user = await db.queryOne('SELECT id, email, name, role, scope_json FROM dash_users WHERE id = $1', [payload.sub]) as DashUser | undefined;

    if (!user) { res.status(401).json({ error: 'User not found.' }); return; }

    const session = await db.queryOne('SELECT revoked FROM dash_sessions WHERE jti = $1', [payload.jti]) as { revoked: number } | undefined;

    if (session?.revoked) { res.status(401).json({ error: 'Session revoked.' }); return; }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions.' });
      return;
    }
    next();
  };
}
