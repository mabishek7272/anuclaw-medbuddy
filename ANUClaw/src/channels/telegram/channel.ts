import TelegramBot from 'node-telegram-bot-api';
import { IChannel, InboundMessage, OutboundMessage } from '../types';
import { logger } from '../../logger';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';

interface TelegramConfig {
  token: string;
  trigger: string;
}

export class TelegramChannel implements IChannel {
  readonly name = 'telegram';
  private bot: TelegramBot;
  private handler?: (msg: InboundMessage) => Promise<void>;
  private trigger: string;

  constructor(cfg: TelegramConfig) {
    this.trigger = cfg.trigger;
    this.bot = new TelegramBot(cfg.token, { polling: true });
  }

  async start(): Promise<void> {
    this.bot.on('message', async (msg) => {
      const text = msg.text ?? msg.caption ?? '';
      const isTrigger =
        text.includes(this.trigger) ||
        (msg.chat.type === 'private');

      if (!isTrigger && msg.chat.type !== 'private') return;

      const inbound: InboundMessage = {
        id: uuidv4(),
        groupId: `telegram_${msg.chat.id}`,
        channel: this.name,
        senderId: String(msg.from?.id ?? 'unknown'),
        senderName: msg.from?.username ?? msg.from?.first_name ?? 'Unknown',
        text: text.replace(this.trigger, '').trim(),
        timestamp: new Date(msg.date * 1000),
        isTrigger,
      };

      // Handle voice messages
      if (msg.voice) {
        const file = await this.bot.getFile(msg.voice.file_id);
        inbound.mediaType = 'voice';
        inbound.mediaPath = `https://api.telegram.org/file/bot${(this.bot as unknown as {token: string}).token}/${file.file_path}`;
      }

      // Handle images
      if (msg.photo) {
        const photo = msg.photo[msg.photo.length - 1];
        const file = await this.bot.getFile(photo.file_id);
        inbound.mediaType = 'image';
        inbound.mediaPath = `https://api.telegram.org/file/bot${(this.bot as unknown as {token: string}).token}/${file.file_path}`;
      }

      await this.handler?.(inbound);
    });

    logger.info('Telegram channel started (polling)');
  }

  async stop(): Promise<void> {
    await this.bot.stopPolling();
  }

  async send(msg: OutboundMessage): Promise<void> {
    const chatId = msg.groupId.replace('telegram_', '');
    if (msg.filePath && fs.existsSync(msg.filePath)) {
      await this.bot.sendDocument(chatId, msg.filePath, { caption: msg.text });
    } else {
      // Split long messages
      const chunks = splitMessage(msg.text, 4096);
      for (const chunk of chunks) {
        await this.bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
      }
    }
  }

  onMessage(handler: (msg: InboundMessage) => Promise<void>): void {
    this.handler = handler;
  }
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxLen;
    if (end < text.length) {
      const newline = text.lastIndexOf('\n', end);
      if (newline > start) end = newline;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}
