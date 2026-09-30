import { CronJob } from 'cron';
import { db } from './db';
import { runAgent } from './container-runner';
import { findChannel } from './channels/registry';
import { logger } from './logger';
import { v4 as uuidv4 } from 'uuid';

interface ScheduledTask {
  id: string;
  groupId: string;
  channel: string;
  name: string;
  cron: string;
  prompt: string;
  enabled: number;
}

const activeJobs = new Map<string, CronJob>();

export function startScheduler(): void {
  // Run async initialization safely in background
  loadAndScheduleAll().catch((err) => logger.error('Error starting tasks scheduler:', err));
  
  // Reload tasks every 5 minutes to pick up new ones
  setInterval(() => {
    loadAndScheduleAll().catch((err) => logger.error('Error reloading tasks scheduler:', err));
  }, 5 * 60 * 1000);
  
  logger.info('Task scheduler started');
}

async function loadAndScheduleAll(): Promise<void> {
  const tasks = await db.query<ScheduledTask>('SELECT * FROM tasks WHERE enabled = 1');

  for (const task of tasks) {
    if (activeJobs.has(task.id)) continue;
    try {
      scheduleTask(task);
    } catch (err) {
      logger.error(`Failed to schedule task ${task.name}:`, err);
    }
  }

  // Cancel jobs for deleted/disabled tasks
  for (const [id, job] of activeJobs) {
    const exists = tasks.find((t) => t.id === id);
    if (!exists) {
      job.stop();
      activeJobs.delete(id);
    }
  }
}

function scheduleTask(task: ScheduledTask): void {
  const job = new CronJob(task.cron, async () => {
    logger.info(`Running scheduled task: ${task.name} (${task.id})`);
    try {
      await db.query('UPDATE tasks SET last_run_at = $1 WHERE id = $2', [new Date().toISOString(), task.id]);
    } catch (err) {
      logger.error(`Failed to update last run time for task ${task.id}:`, err);
    }

    try {
      const result = await runAgent({
        groupId: task.groupId,
        channel: task.channel,
        prompt: task.prompt,
      });

      if (result.text) {
        const ch = findChannel(task.channel);
        if (ch) {
          await ch.send({ groupId: task.groupId, channel: task.channel, text: result.text });
          for (const artifact of result.artifacts) {
            await ch.send({ groupId: task.groupId, channel: task.channel, text: '', filePath: artifact });
          }
        }
      }
    } catch (err) {
      logger.error(`Scheduled task ${task.name} failed:`, err);
    }
  });

  job.start();
  activeJobs.set(task.id, job);
  logger.info(`Scheduled task: ${task.name} @ ${task.cron}`);
}

export async function createTask(
  groupId: string,
  channel: string,
  name: string,
  cron: string,
  prompt: string,
): Promise<string> {
  const id = uuidv4();
  await db.query(
    'INSERT INTO tasks (id, group_id, channel, name, cron, prompt, enabled, created_at) VALUES ($1, $2, $3, $4, $5, $6, 1, $7)',
    [id, groupId, channel, name, cron, prompt, new Date().toISOString()]
  );

  const task = await db.queryOne<ScheduledTask>('SELECT * FROM tasks WHERE id = $1', [id]);
  if (task) {
    scheduleTask(task);
  }
  return id;
}

export async function deleteTask(id: string): Promise<void> {
  const job = activeJobs.get(id);
  if (job) { job.stop(); activeJobs.delete(id); }
  await db.query('DELETE FROM tasks WHERE id = $1', [id]);
}

export async function listTasks(groupId: string): Promise<ScheduledTask[]> {
  return db.query<ScheduledTask>('SELECT * FROM tasks WHERE group_id = $1', [groupId]);
}
