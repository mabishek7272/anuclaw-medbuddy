import { Router } from 'express';
import { requireDashAuth, requireRole } from '../auth';
import { db } from '../../../db';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const router = Router();

function getHooksConfigPath(): string {
  return process.env.HOOKS_CONFIG ?? './hooks.config.yaml';
}

function loadHooksConfig(): Record<string, unknown>[] {
  try {
    const raw = fs.readFileSync(getHooksConfigPath(), 'utf-8');
    const parsed = yaml.load(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHooksConfig(hooks: unknown[]): void {
  fs.writeFileSync(getHooksConfigPath(), yaml.dump(hooks), 'utf-8');
}

// List hooks with recent trigger stats
router.get('/', requireDashAuth, async (_req, res) => {
  const hooks = loadHooksConfig();
  const since = Date.now() - 7 * 86400000;

  try {
    const triggerStats = await db.query(`
      SELECT target_id as hook_id, COUNT(*) as fires, MAX(ts) as last_fired
      FROM audit_events WHERE action='hook.fired' AND ts > $1
      GROUP BY hook_id
    `, [since]) as { hook_id: string; fires: string; last_fired: string }[];

    const blockStats = await db.query(`
      SELECT target_id as hook_id, COUNT(*) as blocks
      FROM audit_events WHERE action='hook.blocked' AND ts > $1
      GROUP BY hook_id
    `, [since]) as { hook_id: string; blocks: string }[];

    const statsById = new Map<string, { fires: number; last_fired: number | null; blocks: number }>();
    for (const t of triggerStats) {
      statsById.set(t.hook_id, {
        fires: Number(t.fires),
        last_fired: Number(t.last_fired),
        blocks: 0
      });
    }
    for (const b of blockStats) {
      const entry = statsById.get(b.hook_id) ?? { fires: 0, last_fired: null, blocks: 0 };
      entry.blocks = Number(b.blocks);
      statsById.set(b.hook_id, entry);
    }

    const result = hooks.map((h: any, i) => ({
      index: i,
      ...h,
      stats: statsById.get(h.id ?? String(i)) ?? { fires: 0, last_fired: null, blocks: 0 },
    }));

    res.json({ hooks: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle hook enabled/disabled
router.patch('/:index/toggle', requireDashAuth, requireRole('admin', 'operator'), (req, res) => {
  const idx = Number(req.params.index);
  const hooks = loadHooksConfig() as any[];
  if (idx < 0 || idx >= hooks.length) {
    res.status(404).json({ error: 'Hook not found.' });
    return;
  }
  hooks[idx].enabled = !hooks[idx].enabled;
  saveHooksConfig(hooks);
  res.json({ ok: true, enabled: hooks[idx].enabled });
});

// Update a hook
router.put('/:index', requireDashAuth, requireRole('admin'), (req, res) => {
  const idx = Number(req.params.index);
  const hooks = loadHooksConfig() as any[];
  if (idx < 0 || idx >= hooks.length) {
    res.status(404).json({ error: 'Hook not found.' });
    return;
  }
  hooks[idx] = { ...hooks[idx], ...req.body };
  saveHooksConfig(hooks);
  res.json({ ok: true, hook: hooks[idx] });
});

// Recent hook fire log
router.get('/log', requireDashAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  try {
    const rows = await db.query(`
      SELECT id, ts, action, target_id, before_json, after_json, group_id, channel
      FROM audit_events
      WHERE action IN ('hook.fired', 'hook.blocked')
      ORDER BY ts DESC LIMIT $1
    `, [limit]);
    res.json({ log: rows.map(r => ({ ...r, ts: Number(r.ts) })) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
