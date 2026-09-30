/**
 * ANUClaw — Unified AI Research & Medical Assistant
 * Main orchestrator: boots channels, runs hook pipeline, dispatches agent containers.
 */

import { config } from './config';
import { logger } from './logger';
import { ensureDbReady, db } from './db';
import { bootChannels, stopAllChannels, findChannel } from './channels/registry';
import { runAgent } from './container-runner';
import { runHooks } from './hooks';
import { routeResponse } from './router';
import { startScheduler } from './task-scheduler';
import { startApiServer } from './api/server';
import { mountDashboard } from './dashboard/server/index';
import { v4 as uuidv4 } from 'uuid';
import { InboundMessage } from './channels/types';
import * as fs from 'fs';
import * as path from 'path';

// ── Per-group queue to serialise concurrent messages ─────────────────────────

const groupQueues = new Map<string, Promise<void>>();

function enqueue(groupId: string, task: () => Promise<void>): void {
  const prev = groupQueues.get(groupId) ?? Promise.resolve();
  const next = prev.then(task).catch((err) => logger.error(`Queue error for ${groupId}:`, err));
  groupQueues.set(groupId, next);
}

// ── Message handler ───────────────────────────────────────────────────────────

async function handleMessage(msg: InboundMessage): Promise<void> {
  if (!msg.isTrigger) return;

  logger.info(`[${msg.channel}] ${msg.senderName}: ${msg.text.slice(0, 120)}`);

  enqueue(msg.groupId, async () => {
    // 1. Run BeforeMessage hooks
    const beforeMsg = await runHooks('BeforeMessage', msg.groupId, msg.channel, {
      text: msg.text,
      senderId: msg.senderId,
      senderName: msg.senderName,
      mediaType: msg.mediaType,
      mediaPath: msg.mediaPath,
    });
    if (!beforeMsg.allowed) {
      logger.info(`Message blocked by hook for ${msg.groupId}`);
      const ch = findChannel(msg.channel);
      await ch?.send({ groupId: msg.groupId, channel: msg.channel, text: '⚠️ Message was blocked by a security policy.' });
      return;
    }

    // 2. Persist message
    await ensureGroup(msg.groupId, msg.channel);
    await db.query(
      'INSERT INTO messages (id, group_id, channel, sender_id, sender_name, role, content, media_type, media_path, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [uuidv4(), msg.groupId, msg.channel, msg.senderId, msg.senderName, 'user', msg.text, msg.mediaType ?? null, msg.mediaPath ?? null, new Date().toISOString()]
    );

    // 3. Load session history
    const sessionRow = await db.queryOne<{ messages_json: string }>('SELECT messages_json FROM sessions WHERE group_id = $1', [msg.groupId]);
    const sessionMessages = sessionRow ? JSON.parse(sessionRow.messages_json) : [];

    // 4. Run BeforeLLMCall hook
    const beforeLLM = await runHooks('BeforeLLMCall', msg.groupId, msg.channel, {
      model: config.llm.provider,
      prompt: msg.text,
      sessionLength: sessionMessages.length,
    });
    if (!beforeLLM.allowed) {
      logger.info(`LLM call blocked by hook for ${msg.groupId}`);
      return;
    }

    // 5. Run agent in container
    const result = await runAgent({
      groupId: msg.groupId,
      channel: msg.channel,
      prompt: String(beforeMsg.payload.text),
      sessionMessages,
      mediaPath: msg.mediaPath,
      mediaType: msg.mediaType,
    });

    // 6. Run AfterToolCall hook on result
    const afterTool = await runHooks('AfterToolCall', msg.groupId, msg.channel, {
      text: result.text,
      artifacts: result.artifacts,
    });

    // 7. Persist assistant response and update session
    const responseText = String(afterTool.payload.text ?? result.text);
    await db.query(
      'INSERT INTO messages (id, group_id, channel, sender_id, sender_name, role, content, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [uuidv4(), msg.groupId, msg.channel, 'anuclaw', 'ANUClaw', 'assistant', responseText, new Date().toISOString()]
    );

    const updatedSession = [
      ...sessionMessages,
      { role: 'user', content: msg.text },
      { role: 'assistant', content: responseText },
    ];
    await db.query(
      'INSERT INTO sessions (id, group_id, messages_json, updated_at) VALUES ($1, $2, $3, $4) ON CONFLICT (group_id) DO UPDATE SET messages_json = EXCLUDED.messages_json, updated_at = EXCLUDED.updated_at',
      [uuidv4(), msg.groupId, JSON.stringify(updatedSession), new Date().toISOString()]
    );

    // 8. Route response back to channel
    const ch = findChannel(msg.channel);
    if (!ch) { logger.error(`Channel not found: ${msg.channel}`); return; }

    const afterMsg = await runHooks('AfterMessage', msg.groupId, msg.channel, { text: responseText });
    await routeResponse(ch, msg.groupId, String(afterMsg.payload.text ?? responseText), result.artifacts);
  });
}

async function ensureGroup(groupId: string, channel: string): Promise<void> {
  const existing = await db.queryOne('SELECT id FROM groups WHERE id = $1', [groupId]);
  if (!existing) {
    await db.query('INSERT INTO groups (id, channel, created_at) VALUES ($1, $2, $3)', [groupId, channel, new Date().toISOString()]);
    // Create per-group workspace
    fs.mkdirSync(path.join(config.agent.groupsDir, groupId), { recursive: true });
    logger.info(`New group registered: ${groupId} on ${channel}`);
  }
  await db.query('UPDATE groups SET last_seen_at = $1 WHERE id = $2', [new Date().toISOString(), groupId]);
}

// ── Startup ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  logger.info('╔══════════════════════════════════════╗');
  logger.info('║          ANUClaw  v1.0.0             ║');
  logger.info('║  Unified AI Research & Medical Agent ║');
  logger.info('╚══════════════════════════════════════╝');
  logger.info(`Provider: ${config.llm.provider} | Memory: ${config.memoryMode} | Hooks: ${config.hooksEnabled}`);

  // Init database and run migrations
  await ensureDbReady();
  logger.info('Database ready');

  // Ensure workspace dirs
  fs.mkdirSync(config.agent.workspaceDir, { recursive: true });
  fs.mkdirSync(config.agent.groupsDir, { recursive: true });

  // Boot all channels
  const channels = await bootChannels();
  if (channels.length === 0) {
    logger.warn('No channels active. Set at least one channel token in .env');
  }

  // Register message handler on all channels
  for (const ch of channels) {
    ch.onMessage(handleMessage);
  }

  // Start task scheduler
  startScheduler();

  // Start API server if enabled (default: on)
  if (process.env.API_ENABLED !== 'false') {
    startApiServer();
  }

  // Start Dashboard if enabled (default: on)
  if (process.env.DASHBOARD_ENABLED !== 'false') {
    mountDashboard();
  }

  logger.info('ANUClaw is running. Send a message to get started.');

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    await stopAllChannels();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await stopAllChannels();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error('Fatal error during startup:', err);
  process.exit(1);
});
