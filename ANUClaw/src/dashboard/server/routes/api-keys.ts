import { Router } from 'express';
import { requireDashAuth } from '../auth';
import { db } from '../../../db';
import * as crypto from 'crypto';

const router = Router();

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// List API keys for current user (admin sees all)
router.get('/', requireDashAuth, async (req: any, res) => {
  const isAdmin = req.user.role === 'admin';
  try {
    const rows = isAdmin
      ? await db.query(`
          SELECT k.id, k.user_id, k.name, k.key_prefix, k.scopes, k.created_at, k.last_used_at, k.expires_at, k.revoked,
                 u.email as user_email
          FROM api_keys k JOIN dash_users u ON u.id=k.user_id
          ORDER BY k.created_at DESC
        `)
      : await db.query(`
          SELECT id, user_id, name, key_prefix, scopes, created_at, last_used_at, expires_at, revoked
          FROM api_keys WHERE user_id=$1 ORDER BY created_at DESC
        `, [req.user.id]);
    res.json({ keys: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create API key
router.post('/', requireDashAuth, async (req: any, res) => {
  const { name, scopes, expires_days } = req.body as { name: string; scopes?: string[]; expires_days?: number };
  if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return; }

  const rawKey = `amgi_live_${crypto.randomBytes(28).toString('hex')}`;
  const keyPrefix = rawKey.slice(0, 20) + '…';
  const id = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = expires_days ? now + expires_days * 86400000 : null;
  const scopesJson = JSON.stringify(scopes ?? ['read']);

  try {
    await db.query(`
      INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, scopes, created_at, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [id, req.user.id, name.trim(), hashKey(rawKey), keyPrefix, scopesJson, now, expiresAt]);

    // Return the raw key ONCE — never stored in plain text
    res.status(201).json({ id, key: rawKey, key_prefix: keyPrefix, name: name.trim(), created_at: now });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Revoke API key
router.delete('/:id', requireDashAuth, async (req: any, res) => {
  try {
    const row = await db.queryOne<{ user_id: string }>('SELECT user_id FROM api_keys WHERE id=$1', [req.params.id]);
    if (!row) { res.status(404).json({ error: 'Not found' }); return; }
    if (row.user_id !== req.user.id && req.user.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden' }); return;
    }
    await db.query('UPDATE api_keys SET revoked=1 WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Stats for proof-of-value page (public-ish — just requires auth)
router.get('/platform-stats', requireDashAuth, async (_req, res) => {
  try {
    const msgs = (await db.queryOne<{ c: string }>(`SELECT COUNT(*) as c FROM audit_events WHERE action='message.received'`))?.c ?? 0;
    const skills = (await db.queryOne<{ c: string }>(`SELECT COUNT(DISTINCT skill) as c FROM tool_calls`))?.c ?? 0;
    const users  = (await db.queryOne<{ c: string }>(`SELECT COUNT(*) as c FROM dash_users`))?.c ?? 0;
    const avgMs  = (await db.queryOne<{ v: string }>(`SELECT CAST(AVG(latency_ms) AS INTEGER) as v FROM tool_calls WHERE ts > $1`, [Date.now() - 86400000]))?.v ?? 0;
    const uptime = process.uptime();
    const totalCalls = (await db.queryOne<{ c: string }>(`SELECT COUNT(*) as c FROM tool_calls`))?.c ?? 0;
    const successRate = (await db.queryOne<{ v: string }>(`SELECT ROUND(SUM(CASE WHEN success=1 THEN 1.0 ELSE 0.0 END)/COUNT(*)*100,1) as v FROM tool_calls`))?.v ?? 99.9;
    res.json({
      msgs: Number(msgs),
      skills: Number(skills),
      users: Number(users),
      avgMs: Number(avgMs),
      uptime,
      totalCalls: Number(totalCalls),
      successRate: Number(successRate)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
