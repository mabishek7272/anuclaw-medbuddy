import { Router } from 'express';
import { requireDashAuth } from '../auth';
import { db } from '../../../db';
import { connectedClients } from '../sse';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const router = Router();

router.get('/', requireDashAuth, async (_req, res) => {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const dayTs = todayStart.getTime();
  const weekTs = now - 7 * 24 * 3600 * 1000;

  try {
    // Active conversations (groups with a message in last 24h)
    const activeConvsRow = await db.queryOne<{ cnt: string }>(`
      SELECT COUNT(DISTINCT group_id) as cnt FROM audit_events
      WHERE ts > $1 AND action LIKE 'message.%'
    `, [now - 86400000]);
    const activeConvs = Number(activeConvsRow?.cnt ?? 0);

    // Messages today
    const msgsTodayRow = await db.queryOne<{ cnt: string }>(`
      SELECT COUNT(*) as cnt FROM audit_events
      WHERE ts > $1 AND action LIKE 'message.%'
    `, [dayTs]);
    const msgsToday = Number(msgsTodayRow?.cnt ?? 0);

    // Skills invoked today
    const skillsTodayRow = await db.queryOne<{ cnt: string }>(`
      SELECT COUNT(*) as cnt FROM tool_calls WHERE ts > $1
    `, [dayTs]);
    const skillsToday = Number(skillsTodayRow?.cnt ?? 0);

    // Scheduled tasks
    let scheduledTasks = 0;
    try {
      const tasksDb = await db.queryOne<{ cnt: string }>(`SELECT COUNT(*) as cnt FROM scheduled_tasks WHERE enabled=1`);
      scheduledTasks = Number(tasksDb?.cnt ?? 0);
    } catch { /* table may not exist */ }

    // Hook blocks today
    const hookBlocksRow = await db.queryOne<{ cnt: string }>(`
      SELECT COUNT(*) as cnt FROM audit_events WHERE ts > $1 AND action = 'hook.blocked'
    `, [dayTs]);
    const hookBlocks = Number(hookBlocksRow?.cnt ?? 0);

    // Audit events today
    const auditTodayRow = await db.queryOne<{ cnt: string }>(`
      SELECT COUNT(*) as cnt FROM audit_events WHERE ts > $1
    `, [dayTs]);
    const auditToday = Number(auditTodayRow?.cnt ?? 0);

    // Top skills this week
    const topSkills = await db.query(`
      SELECT skill, COUNT(*) as count,
             CAST(AVG(latency_ms) AS INTEGER) as avg_ms,
             ROUND(100.0 * SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) / COUNT(*), 1) as success_pct
      FROM tool_calls WHERE ts > $1
      GROUP BY skill ORDER BY count DESC LIMIT 10
    `, [weekTs]);

    // Recent activity stream (last 50)
    const activity = await db.query(`
      SELECT id, ts, action, actor_id, actor_type, channel, group_id, target_type, target_id
      FROM audit_events ORDER BY ts DESC LIMIT 50
    `);

    // DB size - PostgreSQL size lookup can be done via pg_database_size, 
    // but we can also just return a mock db size or 0 to avoid permission issues, 
    // or calculate folder sizes. Let's return 0 or do a simple select.
    let dbSizeKb = 0;
    try {
      const sizeRow = await db.queryOne<{ size: string }>(`
        SELECT pg_database_size($1) as size
      `, [process.env.PG_DATABASE ?? 'anuclaw']);
      if (sizeRow?.size) {
        dbSizeKb = Math.round(Number(sizeRow.size) / 1024);
      }
    } catch { /* ignore if no database stats permissions */ }

    // Avg response latency (last 1000 calls)
    const latRow = await db.queryOne<{ avg_ms: string }>(`
      SELECT CAST(AVG(latency_ms) AS INTEGER) as avg_ms FROM
      (SELECT latency_ms FROM tool_calls ORDER BY ts DESC LIMIT 1000) sub
    `);
    const avgResponseMs = Number(latRow?.avg_ms ?? 0);

    // Active users (distinct actors in last 24h)
    const activeUsersRow = await db.queryOne<{ cnt: string }>(`
      SELECT COUNT(DISTINCT actor_id) as cnt FROM audit_events WHERE ts > $1
    `, [now - 86400000]);
    const activeUsers = Number(activeUsersRow?.cnt ?? 0);

    // Active channels (distinct channels in last 24h)
    const activeChannelsRow = await db.queryOne<{ cnt: string }>(`
      SELECT COUNT(DISTINCT channel) as cnt FROM audit_events WHERE ts > $1 AND channel IS NOT NULL
    `, [now - 86400000]);
    const activeChannels = Number(activeChannelsRow?.cnt ?? 0);

    // Yesterday's same KPIs for deltas
    const yStart = dayTs - 86400000;
    
    const yMsgsRow = await db.queryOne<{ cnt: string }>(`
      SELECT COUNT(*) as cnt FROM audit_events WHERE ts BETWEEN $1 AND $2 AND action LIKE 'message.%'
    `, [yStart, dayTs]);
    const yMsgs = Number(yMsgsRow?.cnt ?? 0);

    const ySkillsRow = await db.queryOne<{ cnt: string }>(`
      SELECT COUNT(*) as cnt FROM tool_calls WHERE ts BETWEEN $1 AND $2
    `, [yStart, dayTs]);
    const ySkills = Number(ySkillsRow?.cnt ?? 0);

    const yHooksRow = await db.queryOne<{ cnt: string }>(`
      SELECT COUNT(*) as cnt FROM audit_events WHERE ts BETWEEN $1 AND $2 AND action='hook.blocked'
    `, [yStart, dayTs]);
    const yHooks = Number(yHooksRow?.cnt ?? 0);

    // Channel board
    const channelRows = await db.query(`
      SELECT channel, COUNT(*) as msgCount FROM audit_events
      WHERE ts > $1 AND channel IS NOT NULL AND action LIKE 'message.%'
      GROUP BY channel ORDER BY msgCount DESC
    `, [now - 7 * 86400000]) as Array<{ channel: string; msgcount: string }>;
    
    const channelBoard = channelRows.map(r => ({
      channel: r.channel,
      status: 'online',
      msgCount: Number(r.msgcount)
    }));

    // System info
    const memMb = Math.round(process.memoryUsage().rss / 1048576);
    const totalMem = Math.round(os.totalmem() / 1048576);
    const freeMem  = Math.round(os.freemem() / 1048576);
    const cpuPct   = Math.min(100, Math.round((1 - freeMem / totalMem) * 100));
    const uptimeSec = Math.floor(process.uptime());

    const kpis = {
      messagesToday: msgsToday,
      activeChannels,
      activeUsers,
      skillsInvoked: skillsToday,
      avgResponseMs,
      blockedByHooks: hookBlocks,
    };

    const systemHealth = {
      runtime: 'ANUClaw v1.0.0',
      memMb,
      uptimeSec,
      nodeVersion: process.version,
      dbSizeKb,
      cpuPct,
      connectedClients: connectedClients(),
    };

    const deltas: Record<string, number> = {
      messagesToday: yMsgs  > 0 ? Math.round(((msgsToday  - yMsgs)  / yMsgs)  * 100) : 0,
      skillsInvoked: ySkills > 0 ? Math.round(((skillsToday - ySkills) / ySkills) * 100) : 0,
      blockedByHooks:yHooks  > 0 ? Math.round(((hookBlocks  - yHooks)  / yHooks)  * 100) : 0,
    };

    // Sparkline history query promises
    const convPromises = Array.from({ length: 7 }, async (_, i) => {
      const dayStart = now - (6 - i) * 86400000;
      const dayEnd   = now - (5 - i) * 86400000;
      const r = await db.queryOne<{ cnt: string }>(`
        SELECT COUNT(DISTINCT group_id) as cnt FROM audit_events
        WHERE ts BETWEEN $1 AND $2 AND action LIKE 'message.%'
      `, [dayStart, dayEnd]);
      return Number(r?.cnt ?? 0);
    });

    const msgPromises = Array.from({ length: 7 }, async (_, i) => {
      const dayStart = now - (6 - i) * 86400000;
      const dayEnd   = now - (5 - i) * 86400000;
      const r = await db.queryOne<{ cnt: string }>(`
        SELECT COUNT(*) as cnt FROM audit_events
        WHERE ts BETWEEN $1 AND $2 AND action LIKE 'message.%'
      `, [dayStart, dayEnd]);
      return Number(r?.cnt ?? 0);
    });

    const skillPromises = Array.from({ length: 7 }, async (_, i) => {
      const dayStart = now - (6 - i) * 86400000;
      const dayEnd   = now - (5 - i) * 86400000;
      const r = await db.queryOne<{ cnt: string }>(`
        SELECT COUNT(*) as cnt FROM tool_calls WHERE ts BETWEEN $1 AND $2
      `, [dayStart, dayEnd]);
      return Number(r?.cnt ?? 0);
    });

    const userPromises = Array.from({ length: 7 }, async (_, i) => {
      const dayStart = now - (6 - i) * 86400000;
      const dayEnd   = now - (5 - i) * 86400000;
      const r = await db.queryOne<{ cnt: string }>(`
        SELECT COUNT(DISTINCT actor_id) as cnt FROM audit_events WHERE ts BETWEEN $1 AND $2
      `, [dayStart, dayEnd]);
      return Number(r?.cnt ?? 0);
    });

    const [convHistory, msgHistory, skillHistory, userHistory] = await Promise.all([
      Promise.all(convPromises),
      Promise.all(msgPromises),
      Promise.all(skillPromises),
      Promise.all(userPromises),
    ]);

    const kpiHistory = {
      conversations: convHistory,
      messages: msgHistory,
      skills: skillHistory,
      users: userHistory,
    };

    // Cast response object counts
    const topSkillsCast = topSkills.map(s => ({
      ...s,
      count: Number(s.count),
      avg_ms: Number(s.avg_ms),
      success_pct: Number(s.success_pct)
    }));

    const activityCast = activity.map(a => ({
      ...a,
      ts: Number(a.ts)
    }));

    res.json({
      kpis,
      systemHealth,
      topSkills: topSkillsCast,
      activity: activityCast,
      kpiHistory,
      channelBoard,
      deltas
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
