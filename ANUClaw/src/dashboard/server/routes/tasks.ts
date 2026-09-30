import { Router } from 'express';
import { requireDashAuth, requireRole } from '../auth';
import { db } from '../../../db';
import * as crypto from 'crypto';

const router = Router();

async function ensureTable(): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id          VARCHAR(255) PRIMARY KEY,
      name        VARCHAR(255) NOT NULL,
      cron        VARCHAR(100) NOT NULL,
      skill       VARCHAR(255) NOT NULL,
      prompt      TEXT NOT NULL,
      group_id    VARCHAR(255),
      enabled     INTEGER DEFAULT 1,
      last_run    BIGINT,
      last_status VARCHAR(100),
      created_at  BIGINT NOT NULL,
      created_by  VARCHAR(255)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS task_runs (
      id         SERIAL PRIMARY KEY,
      task_id    VARCHAR(255) NOT NULL REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
      ts         BIGINT NOT NULL,
      status     VARCHAR(100),
      output     TEXT,
      latency_ms INTEGER
    )
  `);
}

router.use(async (_req, _res, next) => {
  try {
    await ensureTable();
    next();
  } catch (err) {
    next(err);
  }
});

// List tasks
router.get('/', requireDashAuth, async (_req, res) => {
  try {
    const tasks = await db.query(`
      SELECT t.*,
             (SELECT COUNT(*) FROM task_runs WHERE task_id = t.id) as run_count
      FROM scheduled_tasks t ORDER BY created_at DESC
    `);
    res.json({ tasks });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create task
router.post('/', requireDashAuth, requireRole('admin', 'operator'), async (req, res) => {
  const { name, cron, skill, prompt, group_id } = req.body as Record<string, string>;
  if (!name || !cron || !skill || !prompt) {
    res.status(400).json({ error: 'name, cron, skill, and prompt are required.' });
    return;
  }
  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    await db.query(`
      INSERT INTO scheduled_tasks (id, name, cron, skill, prompt, group_id, enabled, created_at, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8)
    `, [id, name, cron, skill, prompt, group_id ?? null, now, (req as any).user?.id ?? 'system']);
    res.status(201).json({ id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update task
router.put('/:id', requireDashAuth, requireRole('admin', 'operator'), async (req, res) => {
  const { name, cron, skill, prompt, group_id, enabled } = req.body as Record<string, unknown>;
  try {
    await db.query(`
      UPDATE scheduled_tasks SET name=COALESCE($1,name), cron=COALESCE($2,cron),
        skill=COALESCE($3,skill), prompt=COALESCE($4,prompt),
        group_id=COALESCE($5,group_id), enabled=COALESCE($6,enabled)
      WHERE id=$7
    `, [name ?? null, cron ?? null, skill ?? null, prompt ?? null, group_id ?? null, enabled ?? null, req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete task
router.delete('/:id', requireDashAuth, requireRole('admin'), async (req, res) => {
  try {
    await db.query('DELETE FROM task_runs WHERE task_id=$1', [req.params.id]);
    await db.query('DELETE FROM scheduled_tasks WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle enabled
router.patch('/:id/toggle', requireDashAuth, requireRole('admin', 'operator'), async (req, res) => {
  try {
    await db.query(`
      UPDATE scheduled_tasks SET enabled = CASE WHEN enabled=1 THEN 0 ELSE 1 END WHERE id=$1
    `, [req.params.id]);
    const t = await db.queryOne('SELECT enabled FROM scheduled_tasks WHERE id=$1', [req.params.id]) as { enabled: number } | undefined;
    res.json({ ok: true, enabled: !!t?.enabled });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Manual trigger (fire now)
router.post('/:id/trigger', requireDashAuth, requireRole('admin', 'operator'), async (req, res) => {
  try {
    const task = await db.queryOne('SELECT * FROM scheduled_tasks WHERE id=$1', [req.params.id]) as any;
    if (!task) { res.status(404).json({ error: 'Task not found.' }); return; }

    const start = Date.now();
    await db.query(`
      INSERT INTO task_runs (task_id, ts, status, output, latency_ms)
      VALUES ($1, $2, 'triggered', 'Manual trigger from dashboard', $3)
    `, [task.id, start, Date.now() - start]);

    await db.query(`UPDATE scheduled_tasks SET last_run=$1, last_status='triggered' WHERE id=$2`, [Date.now(), task.id]);

    res.json({ ok: true, message: 'Task triggered.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Run history for a task
router.get('/:id/runs', requireDashAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  try {
    const runs = await db.query(`
      SELECT * FROM task_runs WHERE task_id=$1 ORDER BY ts DESC LIMIT $2
    `, [req.params.id, limit]);
    res.json({ runs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
