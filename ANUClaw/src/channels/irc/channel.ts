import { Client } from 'irc-framework';
import { IChannel, InboundMessage, OutboundMessage } from '../types';
import { logger } from '../../logger';
import { v4 as uuidv4 } from 'uuid';

interface IRCConfig { server: string; port: number; nick: string; channel: string }

export class IRCChannel implements IChannel {
  readonly name = 'irc';
  private client: any;
  private handler?: (msg: InboundMessage) => Promise<void>;

  constructor(private cfg: IRCConfig) {
    this.client = new Client();
  }

  async start(): Promise<void> {
    this.client.connect({ host: this.cfg.server, port: this.cfg.port, nick: this.cfg.nick, tls: this.cfg.port === 6697 });

    this.client.on('registered', () => {
      this.client.join(this.cfg.channel);
      logger.info(`IRC channel started — joined ${this.cfg.channel}`);
    });

    this.client.on('privmsg', async (event: { nick: string; message: string; target: string }) => {
      const isMentioned = event.message.includes(this.cfg.nick);
      const isDM = !event.target.startsWith('#');
      if (!isMentioned && !isDM) return;

      const inbound: InboundMessage = {
        id: uuidv4(),
        groupId: `irc_${event.target}`,
        channel: this.name,
        senderId: event.nick,
        senderName: event.nick,
        text: event.message.replace(new RegExp(`${this.cfg.nick}:?\\s*`, 'i'), '').trim(),
        timestamp: new Date(),
        isTrigger: true,
      };

      await this.handler?.(inbound);
    });
  }

  async stop(): Promise<void> { this.client.quit('ANUClaw shutting down'); }

  async send(msg: OutboundMessage): Promise<void> {
    const target = msg.groupId.replace('irc_', '');
    const lines = msg.text.split('\n').slice(0, 10);
    for (const line of lines) {
      if (line.trim()) this.client.say(target, line);
    }
  }

  onMessage(handler: (msg: InboundMessage) => Promise<void>): void { this.handler = handler; }
}
