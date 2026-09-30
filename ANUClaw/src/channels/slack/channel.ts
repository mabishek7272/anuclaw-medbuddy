import { App } from '@slack/bolt';
import { IChannel, InboundMessage, OutboundMessage } from '../types';
import { logger } from '../../logger';
import { v4 as uuidv4 } from 'uuid';

interface SlackConfig { botToken: string; appToken: string; signingSecret: string }

export class SlackChannel implements IChannel {
  readonly name = 'slack';
  private app: App;
  private handler?: (msg: InboundMessage) => Promise<void>;

  constructor(private cfg: SlackConfig) {
    this.app = new App({
      token: cfg.botToken,
      appToken: cfg.appToken,
      signingSecret: cfg.signingSecret,
      socketMode: true,
    });
  }

  async start(): Promise<void> {
    this.app.message(async ({ message, say }) => {
      const msg = message as { text?: string; channel: string; user?: string; ts: string };
      if (!msg.text) return;

      const inbound: InboundMessage = {
        id: uuidv4(),
        groupId: `slack_${msg.channel}`,
        channel: this.name,
        senderId: msg.user ?? 'unknown',
        senderName: msg.user ?? 'Unknown',
        text: msg.text,
        timestamp: new Date(parseFloat(msg.ts) * 1000),
        isTrigger: true,
      };

      await this.handler?.(inbound);
    });

    await this.app.start();
    logger.info('Slack channel started (Socket Mode)');
  }

  async stop(): Promise<void> { await this.app.stop(); }

  async send(msg: OutboundMessage): Promise<void> {
    const channelId = msg.groupId.replace('slack_', '');
    const chunks = splitSlack(msg.text);
    for (const chunk of chunks) {
      await this.app.client.chat.postMessage({ channel: channelId, text: chunk });
    }
    if (msg.filePath) {
      await this.app.client.files.uploadV2({ channel_id: channelId, file: msg.filePath, filename: msg.filePath.split('/').pop() });
    }
  }

  onMessage(handler: (msg: InboundMessage) => Promise<void>): void { this.handler = handler; }
}

function splitSlack(text: string, max = 4000): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let i = 0;
  while (i < text.length) { parts.push(text.slice(i, i + max)); i += max; }
  return parts;
}
