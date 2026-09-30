import { Router } from 'express';
import { requireDashAuth, requireRole } from '../auth';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

const EDITABLE_ENV_KEYS = [
  'MODEL_PROVIDER', 'TRIGGER_PATTERN', 'MAX_SESSION_MESSAGES',
  'CONTAINER_TIMEOUT_MS', 'HOOKS_ENABLED', 'MEMORY_MODE',
  'MEMORY_COMPACTION_THRESHOLD', 'LOG_LEVEL', 'API_ENABLED',
  'API_PORT', 'CORS_ORIGINS', 'WEB_ENABLED', 'WEB_PORT',
  'WHISPER_ENABLED', 'WHISPER_BACKEND',
];

const REDACTED_KEYS = new Set([
  'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY', 'OPENAI_CODEX_MODEL',
  'TELEGRAM_BOT_TOKEN', 'DISCORD_BOT_TOKEN', 'SLACK_BOT_TOKEN',
  'SLACK_SIGNING_SECRET', 'GMAIL_CLIENT_SECRET', 'ANUCLAW_JWT_SECRET',
  'DASHBOARD_JWT_SECRET',
]);

// Get current settings (safe keys only)
router.get('/', requireDashAuth, (_req, res) => {
  const settings: Record<string, string | undefined> = {};
  for (const key of EDITABLE_ENV_KEYS) {
    settings[key] = process.env[key];
  }
  // Show which channel tokens are SET (not the values)
  const channelKeys = [
    'TELEGRAM_BOT_TOKEN', 'DISCORD_BOT_TOKEN', 'SLACK_BOT_TOKEN',
    'SLACK_APP_TOKEN', 'FEISHU_APP_ID', 'DINGTALK_CLIENT_ID',
    'GMAIL_CLIENT_ID', 'SIGNAL_PHONE_NUMBER', 'MATRIX_ACCESS_TOKEN',
    'NOSTR_PRIVATE_KEY', 'QQ_ACCESS_TOKEN',
  ];
  const channelStatus: Record<string, boolean> = {};
  for (const key of channelKeys) {
    channelStatus[key] = !!process.env[key];
  }
  res.json({ settings, channelStatus });
});

// Get SOUL.md content
router.get('/soul', requireDashAuth, (_req, res) => {
  const soulPath = process.env.SOUL_PATH ?? './SOUL.md';
  try {
    const content = fs.readFileSync(path.resolve(soulPath), 'utf-8');
    res.json({ content, path: soulPath });
  } catch {
    res.json({ content: '', path: soulPath });
  }
});

// Update SOUL.md (admin only)
router.put('/soul', requireDashAuth, requireRole('admin'), (req, res) => {
  const { content } = req.body as { content: string };
  if (typeof content !== 'string') {
    res.status(400).json({ error: 'content is required.' });
    return;
  }
  const soulPath = process.env.SOUL_PATH ?? './SOUL.md';
  fs.writeFileSync(path.resolve(soulPath), content, 'utf-8');
  res.json({ ok: true });
});

// Get .env settings (reads file, redacts secrets)
router.get('/env', requireDashAuth, requireRole('admin'), (_req, res) => {
  const envPath = path.resolve('./.env');
  try {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    const redacted = lines.map(line => {
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) return line;
      const key = line.slice(0, eqIdx).trim();
      if (REDACTED_KEYS.has(key) && line.slice(eqIdx + 1).trim() !== '') {
        return `${key}=***REDACTED***`;
      }
      return line;
    });
    res.json({ env: redacted.join('\n') });
  } catch {
    res.json({ env: '' });
  }
});

// System info
router.get('/system', requireDashAuth, (_req, res) => {
  const { execSync } = require('child_process') as typeof import('child_process');
  let nodeVersion = process.version;
  let platform = process.platform;
  let uptime = process.uptime();
  let memory = process.memoryUsage();

  res.json({
    nodeVersion,
    platform,
    uptimeSeconds: Math.round(uptime),
    memoryMb: {
      rss: Math.round(memory.rss / 1024 / 1024),
      heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
    },
    pid: process.pid,
    env: process.env.NODE_ENV ?? 'development',
  });
});

export default router;
