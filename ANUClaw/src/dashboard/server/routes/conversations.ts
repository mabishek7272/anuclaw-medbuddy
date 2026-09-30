import { Router } from 'express';
import { requireDashAuth } from '../auth';
import { db } from '../../../db';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

// List all conversation groups
router.get('/', requireDashAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const offset = Number(req.query.offset ?? 0);
  const search = (req.query.search as string | undefined) ?? '';

  let rows: any[];
  let total: number;

  try {
    if (search) {
      const msgRows = await db.query(`
        SELECT DISTINCT group_id FROM messages
        WHERE content ILIKE $1 LIMIT 200
      `, [`%${search}%`]);

      const matchedGroups = msgRows.map(r => r.group_id);
      
      let placeholders = '';
      const queryParams: any[] = [];
      if (matchedGroups.length > 0) {
        placeholders = matchedGroups.map((_, idx) => `$${idx + 1}`).join(',');
        queryParams.push(...matchedGroups);
      } else {
        placeholders = "'__no_match__'";
      }

      const searchParamIndex = queryParams.length + 1;
      const limitIndex = queryParams.length + 2;
      const offsetIndex = queryParams.length + 3;
      queryParams.push(`%${search}%`, limit, offset);

      rows = await db.query(`
        SELECT
          group_id,
          COUNT(*) as event_count,
          MAX(ts) as last_activity,
          MIN(ts) as created_at,
          MAX(CASE WHEN action='message.received' THEN actor_id END) as last_user
        FROM audit_events
        WHERE group_id IN (${placeholders}) OR group_id ILIKE $${searchParamIndex}
        GROUP BY group_id
        ORDER BY last_activity DESC
        LIMIT $${limitIndex} OFFSET $${offsetIndex}
      `, queryParams);

      total = rows.length;
    } else {
      rows = await db.query(`
        SELECT
          group_id,
          COUNT(*) as event_count,
          MAX(ts) as last_activity,
          MIN(ts) as created_at,
          MAX(CASE WHEN action='message.received' THEN actor_id END) as last_user
        FROM audit_events
        WHERE group_id IS NOT NULL
        GROUP BY group_id
        ORDER BY last_activity DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      const countRow = await db.queryOne<{ cnt: string }>(`
        SELECT COUNT(DISTINCT group_id) as cnt FROM audit_events WHERE group_id IS NOT NULL
      `);
      total = Number(countRow?.cnt ?? 0);
    }

    // Map rows numeric values
    const formatted = rows.map(r => ({
      ...r,
      event_count: Number(r.event_count),
      last_activity: Number(r.last_activity),
      created_at: Number(r.created_at)
    }));

    res.json({ groups: formatted, total, limit, offset });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get messages + events for a group
router.get('/:groupId/messages', requireDashAuth, async (req, res) => {
  const { groupId } = req.params;
  const limit = Math.min(Number(req.query.limit ?? 100), 500);

  try {
    const events = await db.query(`
      SELECT id, ts, action, actor_id, actor_type, before_json, after_json, channel
      FROM audit_events
      WHERE group_id = $1
      ORDER BY ts ASC
      LIMIT $2
    `, [groupId, limit]);

    const toolCalls = await db.query(`
      SELECT id, ts, skill, success, latency_ms
      FROM tool_calls WHERE group_id = $1
      ORDER BY ts ASC
    `, [groupId]);

    res.json({
      groupId,
      events: events.map(e => ({ ...e, ts: Number(e.ts) })),
      toolCalls: toolCalls.map(tc => ({ ...tc, ts: Number(tc.ts), latency_ms: Number(tc.latency_ms), success: Number(tc.success) }))
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get memory for a group (reads AGENTS.md file for the group)
router.get('/:groupId/memory', requireDashAuth, async (req, res) => {
  const groupId = req.params.groupId as string;
  const groupsDir = process.env.GROUPS_DIR ?? './groups';
  const memFile = path.join(groupsDir, groupId, 'AGENTS.md');

  let fileMemory = '';
  let facts: any[] = [];

  try { fileMemory = fs.readFileSync(memFile, 'utf-8'); } catch { /* ok */ }

  try {
    facts = await db.query(`
      SELECT key, value, created_at FROM memory_facts WHERE group_id = $1 ORDER BY id DESC
    `, [groupId]);
  } catch { /* table may not exist */ }

  res.json({ groupId, fileMemory, facts });
});

// Delete/clear memory for a group
router.delete('/:groupId/memory', requireDashAuth, async (req, res) => {
  const groupId = req.params.groupId as string;
  const groupsDir = process.env.GROUPS_DIR ?? './groups';
  const memFile = path.join(groupsDir, groupId, 'AGENTS.md');

  try { fs.writeFileSync(memFile, ''); } catch { /* ok */ }

  try {
    await db.query('DELETE FROM memory_facts WHERE group_id = $1', [groupId]);
  } catch { /* ok */ }

  res.json({ ok: true });
});

export default router;
