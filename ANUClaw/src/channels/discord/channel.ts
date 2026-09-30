import { Client, GatewayIntentBits, Partials, Message, TextChannel } from 'discord.js';
import { IChannel, InboundMessage, OutboundMessage } from '../types';
import { logger } from '../../logger';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';

interface DiscordConfig { token: string; clientId: string; guildId: string }

export class DiscordChannel implements IChannel {
  readonly name = 'discord';
  private client: Client;
  private handler?: (msg: InboundMessage) => Promise<void>;

  constructor(private cfg: DiscordConfig) {
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
      partials: [Partials.Channel],
    });
  }

  async start(): Promise<void> {
    this.client.on('messageCreate', async (msg: Message) => {
      if (msg.author.bot) return;
      const isMention = msg.mentions.users.has(this.client.user?.id ?? '');
      const isDM = msg.channel.type === 1;
      if (!isMention && !isDM) return;

      const text = msg.content.replace(/<@!?\d+>/g, '').trim();
      const inbound: InboundMessage = {
        id: uuidv4(),
        groupId: `discord_${msg.channelId}`,
        channel: this.name,
        senderId: msg.author.id,
        senderName: msg.author.username,
        text,
        timestamp: msg.createdAt,
        isTrigger: true,
      };

      // Handle image attachments
      const img = msg.attachments.find((a) => a.contentType?.startsWith('image'));
      if (img) { inbound.mediaType = 'image'; inbound.mediaPath = img.url; }

      await this.handler?.(inbound);
    });

    await this.client.login(this.cfg.token);
    logger.info('Discord channel started');
  }

  async stop(): Promise<void> { this.client.destroy(); }

  async send(msg: OutboundMessage): Promise<void> {
    const channelId = msg.groupId.replace('discord_', '');
    const ch = await this.client.channels.fetch(channelId) as TextChannel;
    if (!ch) return;

    const chunks = msg.text.match(/.{1,2000}/gs) ?? [''];
    for (const chunk of chunks) await ch.send({ content: chunk });

    if (msg.filePath && fs.existsSync(msg.filePath)) {
      await ch.send({ files: [msg.filePath] });
    }
  }

  onMessage(handler: (msg: InboundMessage) => Promise<void>): void {
    this.handler = handler;
  }
}
