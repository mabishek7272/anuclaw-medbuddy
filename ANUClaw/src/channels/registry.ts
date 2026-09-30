import { IChannel } from './types';
import { config } from '../config';
import { logger } from '../logger';

// Channel adapter imports — each channel self-registers if credentials exist
import { TelegramChannel } from './telegram/channel';
import { DiscordChannel } from './discord/channel';
import { SlackChannel } from './slack/channel';
import { FeishuChannel } from './feishu/channel';
import { DingTalkChannel } from './dingtalk/channel';
import { EmailChannel } from './email/channel';
import { SignalChannel } from './signal/channel';
import { MatrixChannel } from './matrix/channel';
import { IRCChannel } from './irc/channel';
import { NostrChannel } from './nostr/channel';
import { LocalWebChannel } from './local-web/channel';
// WhatsApp: heavy dependency loaded lazily
// iMessage, QQ: platform-specific, loaded conditionally

const channels: IChannel[] = [];

export async function bootChannels(): Promise<IChannel[]> {
  const candidates: Array<{ name: string; enabled: boolean; factory: () => IChannel }> = [
    {
      name: 'telegram',
      enabled: !!config.channels.telegram.token,
      factory: () => new TelegramChannel(config.channels.telegram),
    },
    {
      name: 'discord',
      enabled: !!config.channels.discord.token,
      factory: () => new DiscordChannel(config.channels.discord),
    },
    {
      name: 'slack',
      enabled: !!config.channels.slack.botToken,
      factory: () => new SlackChannel(config.channels.slack),
    },
    {
      name: 'feishu',
      enabled: !!config.channels.feishu.appId,
      factory: () => new FeishuChannel(config.channels.feishu),
    },
    {
      name: 'dingtalk',
      enabled: !!config.channels.dingtalk.clientId,
      factory: () => new DingTalkChannel(config.channels.dingtalk),
    },
    {
      name: 'email',
      enabled: !!config.channels.email.clientId,
      factory: () => new EmailChannel(config.channels.email),
    },
    {
      name: 'signal',
      enabled: !!config.channels.signal.phoneNumber,
      factory: () => new SignalChannel(config.channels.signal),
    },
    {
      name: 'matrix',
      enabled: !!config.channels.matrix.accessToken,
      factory: () => new MatrixChannel(config.channels.matrix),
    },
    {
      name: 'irc',
      enabled: !!config.channels.irc.server,
      factory: () => new IRCChannel(config.channels.irc),
    },
    {
      name: 'nostr',
      enabled: !!config.channels.nostr.privateKey,
      factory: () => new NostrChannel(config.channels.nostr),
    },
    {
      name: 'web',
      enabled: config.channels.web.enabled,
      factory: () => new LocalWebChannel(config.channels.web),
    },
  ];

  // WhatsApp — lazy load (baileys is heavy)
  if (config.channels.whatsapp.enabled) {
    try {
      // @ts-ignore
      const { WhatsAppChannel } = await import('./whatsapp/channel');
      channels.push(new WhatsAppChannel(config.channels.whatsapp));
    } catch (err) {
      logger.warn('WhatsApp channel failed to load:', err);
    }
  }

  // iMessage — macOS only
  if (config.channels.imessage.enabled && process.platform === 'darwin') {
    try {
      // @ts-ignore
      const { IMessageChannel } = await import('./imessage/channel');
      channels.push(new IMessageChannel(config.channels.imessage));
    } catch (err) {
      logger.warn('iMessage channel failed to load:', err);
    }
  }

  // QQ — conditional
  if (config.channels.qq.enabled) {
    try {
      // @ts-ignore
      const { QQChannel } = await import('./qq/channel');
      channels.push(new QQChannel(config.channels.qq));
    } catch (err) {
      logger.warn('QQ channel failed to load:', err);
    }
  }

  for (const candidate of candidates) {
    if (!candidate.enabled) continue;
    try {
      const ch = candidate.factory();
      channels.push(ch);
      logger.info(`Channel registered: ${candidate.name}`);
    } catch (err) {
      logger.error(`Failed to create channel ${candidate.name}:`, err);
    }
  }

  // Start all channels
  await Promise.allSettled(
    channels.map((ch) =>
      ch.start().catch((err) => logger.error(`Channel ${ch.name} failed to start:`, err)),
    ),
  );

  logger.info(`${channels.length} channel(s) active: ${channels.map((c) => c.name).join(', ')}`);
  return channels;
}

export function getChannels(): IChannel[] {
  return channels;
}

export function findChannel(name: string): IChannel | undefined {
  return channels.find((c) => c.name === name);
}

export async function stopAllChannels(): Promise<void> {
  await Promise.allSettled(channels.map((ch) => ch.stop()));
}
