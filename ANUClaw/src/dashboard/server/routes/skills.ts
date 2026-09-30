import { Router } from 'express';
import { requireDashAuth } from '../auth';
import { db } from '../../../db';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

function getSkillList(): { name: string; path: string; description: string }[] {
  const containerDir = path.resolve('./container/skills');
  const skills: { name: string; path: string; description: string }[] = [];
  try {
    const dirs = fs.readdirSync(containerDir, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const skillPath = path.join(containerDir, d.name, 'SKILL.md');
      let description = '';
      try {
        const content = fs.readFileSync(skillPath, 'utf-8');
        const match = content.match(/^#+\s*(.+)/m);
        description = match?.[1]?.trim() ?? '';
      } catch { /* ok */ }
      skills.push({ name: d.name, path: skillPath, description });
    }
  } catch { /* ok */ }
  return skills;
}

// List all skills with stats
router.get('/', requireDashAuth, async (_req, res) => {
  const skillList = getSkillList();
  const statsMap = new Map<string, { invocations: number; avg_latency: number; success_rate: number }>();
  
  try {
    const stats = await db.query(`
      SELECT skill, COUNT(*) as invocations,
             CAST(AVG(latency_ms) AS INTEGER) as avg_latency,
             ROUND(SUM(CASE WHEN success=1 THEN 1.0 ELSE 0.0 END)/COUNT(*),3) as success_rate
      FROM tool_calls
      WHERE ts > (EXTRACT(EPOCH FROM (NOW() - INTERVAL '7 days')) * 1000)
      GROUP BY skill
    `) as { skill: string; invocations: string; avg_latency: string; success_rate: string }[];

    for (const s of stats) {
      statsMap.set(s.skill, {
        invocations: Number(s.invocations),
        avg_latency: Number(s.avg_latency),
        success_rate: Number(s.success_rate)
      });
    }
  } catch { /* ok */ }

  const result = skillList.map(s => ({
    ...s,
    stats: statsMap.get(s.name) ?? { invocations: 0, avg_latency: 0, success_rate: 1 },
  }));

  res.json({ skills: result, total: result.length });
});

// Get detailed stats for one skill
router.get('/:skillName/stats', requireDashAuth, async (req, res) => {
  const { skillName } = req.params;
  const days = Number(req.query.days ?? 7);
  const since = Date.now() - days * 86400000;

  try {
    const daily = await db.query(`
      SELECT
        to_char(to_timestamp(ts/1000.0), 'YYYY-MM-DD') as day,
        COUNT(*) as calls,
        CAST(AVG(latency_ms) AS INTEGER) as avg_ms,
        SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) as failures
      FROM tool_calls WHERE skill = $1 AND ts > $2
      GROUP BY day ORDER BY day ASC
    `, [skillName, since]);

    const overall = await db.queryOne(`
      SELECT COUNT(*) as total,
             CAST(AVG(latency_ms) AS INTEGER) as avg_ms,
             MIN(latency_ms) as min_ms,
             MAX(latency_ms) as max_ms,
             SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) as failures
      FROM tool_calls WHERE skill = $1 AND ts > $2
    `, [skillName, since]);

    // Map rows numeric values
    const dailyCast = daily.map(d => ({
      ...d,
      calls: Number(d.calls),
      avg_ms: Number(d.avg_ms),
      failures: Number(d.failures)
    }));

    const overallCast = overall ? {
      total: Number(overall.total),
      avg_ms: Number(overall.avg_ms),
      min_ms: Number(overall.min_ms),
      max_ms: Number(overall.max_ms),
      failures: Number(overall.failures)
    } : null;

    res.json({ skill: skillName, overall: overallCast, daily: dailyCast });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
