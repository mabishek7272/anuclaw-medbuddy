import { Router } from 'express';
import { requireDashAuth, requireRole } from '../auth';
import { db } from '../../../db';

const router = Router();

// Query audit log with filters
router.get('/', requireDashAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 100), 1000);
  const offset = Number(req.query.offset ?? 0);
  const action    = (req.query.action    as string | undefined) ?? '';
  const actor     = (req.query.actor     as string | undefined) ?? '';
  const channel   = (req.query.channel   as string | undefined) ?? '';
  const groupId   = (req.query.group_id  as string | undefined) ?? '';
  const fromTs    = Number(req.query.from ?? 0);
  const toTs      = Number(req.query.to   ?? Date.now());

  try {
    const rows = await db.query(`
      SELECT id, ts, actor_id, actor_type, action, target_type, target_id,
             before_json, after_json, channel, group_id, ip
      FROM audit_events
      WHERE ts BETWEEN $1 AND $2
        AND ($3 = '' OR action ILIKE '%' || $4 || '%')
        AND ($5 = '' OR actor_id ILIKE '%' || $6 || '%')
        AND ($7 = '' OR channel = $8)
        AND ($9 = '' OR group_id = $10)
      ORDER BY ts DESC
      LIMIT $11 OFFSET $12
    `, [fromTs, toTs, action, action, actor, actor, channel, channel, groupId, groupId, limit, offset]);

    const totalRow = await db.queryOne<{ cnt: string }>(`
      SELECT COUNT(*) as cnt FROM audit_events
      WHERE ts BETWEEN $1 AND $2
        AND ($3 = '' OR action ILIKE '%' || $4 || '%')
        AND ($5 = '' OR actor_id ILIKE '%' || $6 || '%')
        AND ($7 = '' OR channel = $8)
        AND ($9 = '' OR group_id = $10)
    `, [fromTs, toTs, action, action, actor, actor, channel, channel, groupId, groupId]);

    const total = Number(totalRow?.cnt ?? 0);
    res.json({ events: rows, total, limit, offset });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Export audit log as signed NDJSON bundle
router.get('/export', requireDashAuth, requireRole('admin', 'auditor', 'compliance'), async (req, res) => {
  const fromTs = Number(req.query.from ?? 0);
  const toTs   = Number(req.query.to   ?? Date.now());
  const crypto = require('crypto') as typeof import('crypto');
  const SECRET = process.env.ANUCLAW_JWT_SECRET ?? 'audit-hmac-secret';

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Content-Disposition', `attachment; filename="audit-export-${Date.now()}.ndjson"`);

  try {
    const rows = await db.query(`
      SELECT * FROM audit_events WHERE ts BETWEEN $1 AND $2 ORDER BY ts ASC
    `, [fromTs, toTs]);

    // Write metadata header
    const meta = {
      _type: 'export_meta',
      exported_at: new Date().toISOString(),
      from: fromTs,
      to: toTs,
      record_count: rows.length,
      exported_by: (req as any).user?.email ?? 'unknown',
    };
    res.write(JSON.stringify(meta) + '\n');

    // Write rows with per-row HMAC for tamper detection
    for (const row of rows) {
      const payload = JSON.stringify(row);
      const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
      res.write(JSON.stringify({ ...row as object, _sig: sig }) + '\n');
    }

    // Write footer with bundle HMAC
    const bundleHmac = crypto.createHmac('sha256', SECRET)
      .update(rows.map(r => JSON.stringify(r)).join('\n'))
      .digest('hex');
    res.write(JSON.stringify({ _type: 'export_footer', bundle_hmac: bundleHmac, record_count: rows.length }) + '\n');
    res.end();
  } catch (err: any) {
    // If headers haven't been sent, we can return 500, but they are already set.
    res.write(JSON.stringify({ error: err.message }) + '\n');
    res.end();
  }
});

// Single event detail
router.get('/:id', requireDashAuth, async (req, res) => {
  try {
    const row = await db.queryOne('SELECT * FROM audit_events WHERE id=$1', [Number(req.params.id)]);
    if (!row) { res.status(404).json({ error: 'Not found.' }); return; }
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
