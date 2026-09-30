import * as https from 'https';
import * as http from 'http';
import { IChannel, InboundMessage, OutboundMessage } from '../types';
import { logger } from '../../logger';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

interface FeishuConfig { appId: string; appSecret: string; verificationToken: string }

export class FeishuChannel implements IChannel {
  readonly name = 'feishu';
  private handler?: (msg: InboundMessage) => Promise<void>;
  private accessToken?: string;
  private tokenExpiry = 0;

  constructor(private cfg: FeishuConfig) {}

  private async refreshToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) return this.accessToken;
    const res = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      app_id: this.cfg.appId,
      app_secret: this.cfg.appSecret,
    });
    this.accessToken = res.data.tenant_access_token;
    this.tokenExpiry = Date.now() + (res.data.expire - 60) * 1000;
    return this.accessToken!;
  }

  async start(): Promise<void> {
    await this.refreshToken();
    // Feishu uses Long Connection (WebSocket) or webhook — polling fallback here
    logger.info('Feishu channel started (webhook mode — configure your Feishu app webhook URL)');
  }

  async stop(): Promise<void> {}

  /** Called by the webhook handler in src/index.ts */
  async handleWebhook(body: Record<string, unknown>): Promise<void> {
    const event = (body.event ?? body) as Record<string, unknown>;
    const text = String((event.message as Record<string, unknown>)?.content ?? event.text ?? '');
    const chatId = String((event.message as Record<string, unknown>)?.chat_id ?? event.open_chat_id ?? '');
    const senderId = String((event.sender as any)?.sender_id?.open_id ?? '');

    const inbound: InboundMessage = {
      id: uuidv4(),
      groupId: `feishu_${chatId}`,
      channel: this.name,
      senderId,
      senderName: senderId,
      text,
      timestamp: new Date(),
      isTrigger: true,
    };

    await this.handler?.(inbound);
  }

  async send(msg: OutboundMessage): Promise<void> {
    const token = await this.refreshToken();
    const chatId = msg.groupId.replace('feishu_', '');
    await axios.post(
      'https://open.feishu.cn/open-apis/im/v1/messages',
      {
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text: msg.text }),
      },
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { receive_id_type: 'chat_id' },
      },
    );
  }

  onMessage(handler: (msg: InboundMessage) => Promise<void>): void { this.handler = handler; }
}
