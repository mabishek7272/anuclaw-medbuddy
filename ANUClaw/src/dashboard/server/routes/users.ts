import { Router } from 'express';
import { requireDashAuth, requireRole, issueTokens, DashUser } from '../auth';
import { db } from '../../../db';
import * as crypto from 'crypto';

const router = Router();

function hashPassword(pw: string): string {
  return crypto.createHash('sha256').update(pw + 'anuclaw-salt').digest('hex');
}

// List users (admin only)
router.get('/', requireDashAuth, requireRole('admin'), async (_req, res) => {
  try {
    const users = await db.query(`
      SELECT id, email, name, role, scope_json, created_at, last_login_at FROM dash_users ORDER BY created_at DESC
    `);
    res.json({ users });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create user (admin only)
router.post('/', requireDashAuth, requireRole('admin'), async (req, res) => {
  const { email, name, role, password, scope_json } = req.body as Record<string, string>;
  const validRoles = ['admin', 'operator', 'viewer', 'auditor', 'compliance'];
  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required.' });
    return;
  }
  if (role && !validRoles.includes(role)) {
    res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
    return;
  }
  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    await db.query(`
      INSERT INTO dash_users (id, email, name, role, scope_json, password_hash, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [id, email, name ?? null, role ?? 'viewer', scope_json ?? '{}', hashPassword(password), now]);
    res.status(201).json({ id });
  } catch (e: any) {
    if (e?.message?.includes('UNIQUE')) {
      res.status(409).json({ error: 'Email already exists.' });
      return;
    }
    res.status(500).json({ error: e.message });
  }
});

// Update user (admin only)
router.put('/:id', requireDashAuth, requireRole('admin'), async (req, res) => {
  const { name, role, scope_json } = req.body as Record<string, string>;
  try {
    await db.query(`
      UPDATE dash_users SET name=COALESCE($1,name), role=COALESCE($2,role), scope_json=COALESCE($3,scope_json) WHERE id=$4
    `, [name ?? null, role ?? null, scope_json ?? null, req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Change password (admin, or self)
router.patch('/:id/password', requireDashAuth, async (req: any, res) => {
  const isSelf = req.user?.id === req.params.id;
  const isAdmin = req.user?.role === 'admin';
  if (!isSelf && !isAdmin) {
    res.status(403).json({ error: 'Insufficient permissions.' });
    return;
  }
  const { password } = req.body as { password: string };
  if (!password || password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' });
    return;
  }
  try {
    await db.query('UPDATE dash_users SET password_hash=$1 WHERE id=$2', [hashPassword(password), req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete user (admin only, cannot delete self)
router.delete('/:id', requireDashAuth, requireRole('admin'), async (req: any, res) => {
  if (req.user?.id === req.params.id) {
    res.status(400).json({ error: 'Cannot delete your own account.' });
    return;
  }
  try {
    await db.query('DELETE FROM dash_users WHERE id=$1', [req.params.id]);
    await db.query('UPDATE dash_sessions SET revoked=1 WHERE user_id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  if (!email || !password) {
    res.status(400).json({ error: 'email and password required.' });
    return;
  }
  try {
    const user = await db.queryOne('SELECT * FROM dash_users WHERE email=$1', [email]) as (DashUser & { password_hash: string }) | undefined;
    if (!user || user.password_hash !== hashPassword(password)) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }
    await db.query('UPDATE dash_users SET last_login_at=$1 WHERE id=$2', [Date.now(), user.id]);
    const { accessToken, refreshToken } = await issueTokens(user.id);
    res
      .cookie('dash_token', accessToken, { httpOnly: true, sameSite: 'lax', maxAge: 15 * 60 * 1000 })
      .cookie('dash_refresh', refreshToken, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 })
      .json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Logout
router.post('/logout', requireDashAuth, async (req: any, res) => {
  const token = req.cookies?.dash_refresh;
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const SECRET = process.env.DASHBOARD_JWT_SECRET ?? process.env.ANUCLAW_JWT_SECRET ?? 'dashboard-secret-change-me';
      const payload = jwt.verify(token, SECRET) as { jti: string };
      await db.query('UPDATE dash_sessions SET revoked=1 WHERE jti=$1', [payload.jti]);
    } catch { /* ok */ }
  }
  res.clearCookie('dash_token').clearCookie('dash_refresh').json({ ok: true });
});

// Refresh access token
router.post('/refresh', async (req, res) => {
  const token = req.cookies?.dash_refresh;
  if (!token) { res.status(401).json({ error: 'No refresh token.' }); return; }
  try {
    const jwt = require('jsonwebtoken');
    const SECRET = process.env.DASHBOARD_JWT_SECRET ?? process.env.ANUCLAW_JWT_SECRET ?? 'dashboard-secret-change-me';
    const payload = jwt.verify(token, SECRET) as { sub: string; jti: string; type: string };
    if (payload.type !== 'refresh') throw new Error('Wrong token type');
    const session = await db.queryOne('SELECT revoked FROM dash_sessions WHERE jti=$1', [payload.jti]) as { revoked: number } | undefined;
    if (session?.revoked) throw new Error('Revoked');
    const { accessToken } = await issueTokens(payload.sub);
    res.cookie('dash_token', accessToken, { httpOnly: true, sameSite: 'lax', maxAge: 15 * 60 * 1000 })
       .json({ ok: true });
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token.' });
  }
});

// Current user profile (includes terms status)
router.get('/me', requireDashAuth, async (req: any, res) => {
  try {
    const user = await db.queryOne('SELECT id, email, name, role, created_at, last_login_at, terms_accepted_at FROM dash_users WHERE id=$1', [req.user.id]);
    res.json({ user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Accept terms / product acknowledgement
router.post('/accept-terms', requireDashAuth, async (req: any, res) => {
  const now = Date.now();
  try {
    await db.query('UPDATE dash_users SET terms_accepted_at=$1 WHERE id=$2', [now, req.user.id]);
    res.json({ ok: true, terms_accepted_at: now });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
