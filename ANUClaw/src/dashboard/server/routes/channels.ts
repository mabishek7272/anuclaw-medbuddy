import { Router } from 'express';
import { requireDashAuth, requireRole } from '../auth';
import { db } from '../../../db';

const router = Router();

const KNOWN_CHANNELS = [
  'telegram', 'discord', 'slack', 'whatsapp', 'feishu', 'dingtalk',
  'gmail', 'signal', 'matrix', 'imessage', 'irc', 'nostr', 'qq', 'web',
];

// Get channel status board
router.get('/', requireDashAuth, async (req, res) => {
  const since    = Date.now() - 24 * 3600000;
  const sinceHour = Date.now() - 3600000;

  try {
    const msgStats = await db.query(`
      SELECT channel,
             COUNT(*) as msgs_24h,
             MAX(ts) as last_seen,
             SUM(CASE WHEN ts > $1 THEN 1 ELSE 0 END) as msgs_1h,
             SUM(CASE WHEN action='channel.error' THEN 1 ELSE 0 END) as errors_24h
      FROM audit_events
      WHERE ts > $2 AND channel IS NOT NULL
      GROUP BY channel
    `, [sinceHour, since]) as {
      channel: string; msgs_24h: string; last_seen: string;
      msgs_1h: string; errors_24h: string;
    }[];

    const statsMap = new Map(msgStats.map(s => [s.channel, {
      channel: s.channel,
      msgs_24h: Number(s.msgs_24h),
      last_seen: Number(s.last_seen),
      msgs_1h: Number(s.msgs_1h),
      errors_24h: Number(s.errors_24h),
    }]));

    const channels = KNOWN_CHANNELS.map(name => {
      const s = statsMap.get(name);
      const envKey = name.toUpperCase() + '_BOT_TOKEN';
      const altKey = name.toUpperCase() + '_ENABLED';
      const configured = !!(process.env[envKey] || process.env[altKey] ||
        // Special-case channels
        (name === 'web'      && process.env.WEB_ENABLED !== 'false') ||
        (name === 'whatsapp' && process.env.WHATSAPP_ENABLED !== 'false') ||
        (name === 'telegram' && process.env.TELEGRAM_BOT_TOKEN)
      );

      let status: 'green' | 'amber' | 'red' | 'disabled';
      if (!configured) {
        status = 'disabled';
      } else if (!s || s.last_seen < Date.now() - 2 * 3600000) {
        status = 'amber';
      } else if (s.errors_24h > 5) {
        status = 'red';
      } else {
        status = 'green';
      }

      return {
        name,
        configured,
        status,
        msgs_24h:   s?.msgs_24h   ?? 0,
        msgs_1h:    s?.msgs_1h    ?? 0,
        errors_24h: s?.errors_24h ?? 0,
        last_seen:  s?.last_seen  ?? null,
      };
    });

    res.json({ channels });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get hourly message volume timeline for a channel (last 24h)
router.get('/:channel/timeline', requireDashAuth, async (req, res) => {
  const { channel } = req.params;
  try {
    const rows = await db.query(`
      SELECT
        to_char(to_timestamp(ts / 1000.0), 'YYYY-MM-DD"T"HH24:00:00"Z"') as hour,
        COUNT(*) as count,
        SUM(CASE WHEN action='channel.error' THEN 1 ELSE 0 END) as errors
      FROM audit_events
      WHERE channel = $1 AND ts > $2
      GROUP BY hour ORDER BY hour ASC
    `, [channel, Date.now() - 24 * 3600000]);
    res.json({ channel, timeline: rows.map(r => ({ ...r, count: Number(r.count), errors: Number(r.errors) })) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get WhatsApp QR code (reads from shared session file)
router.get('/whatsapp/qr', requireDashAuth, (_req, res) => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const qrFile = path.resolve(process.env.WHATSAPP_SESSION_DIR ?? './.whatsapp-auth', 'qr.txt');
  try {
    const qr = fs.readFileSync(qrFile, 'utf-8').trim();
    res.json({ qr });
  } catch {
    res.json({ qr: null });
  }
});

// Restart a channel
router.post('/:channel/restart', requireDashAuth, requireRole('admin', 'operator'), async (req: any, res) => {
  const channel = req.params.channel as string;
  if (!KNOWN_CHANNELS.includes(channel)) {
    res.status(400).json({ error: 'Unknown channel.' });
    return;
  }

  try {
    // Write a restart signal to audit log
    await db.query(`
      INSERT INTO audit_events (ts, actor_id, actor_type, action, target_type, target_id, ip)
      VALUES ($1, $2, 'user', 'channel.restart', 'channel', $3, $4)
    `, [Date.now(), req.user?.id ?? 'system', channel, req.ip ?? 'local']);

    // Attempt runtime restart via dynamic import of channel registry
    try {
      const { findChannel } = require('../../../channels/registry') as { findChannel: (name: string) => any };
      const ch = findChannel(channel);
      if (ch?.restart) {
        ch.restart().catch(() => {/* ok */});
      }
    } catch { /* registry not available in all contexts */ }

    res.json({ ok: true, message: `Restart signal sent for ${channel}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
