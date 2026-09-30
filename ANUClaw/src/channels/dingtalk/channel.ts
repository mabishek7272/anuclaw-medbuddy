import { IChannel, InboundMessage, OutboundMessage } from '../types';
import { logger } from '../../logger';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

interface DingTalkConfig { clientId: string; clientSecret: string }

export class DingTalkChannel implements IChannel {
  readonly name = 'dingtalk';
  private handler?: (msg: InboundMessage) => Promise<void>;
  private accessToken?: string;
  private tokenExpiry = 0;

  constructor(private cfg: DingTalkConfig) {}

  private async refreshToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) return this.accessToken;
    const res = await axios.post('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
      appKey: this.cfg.clientId,
      appSecret: this.cfg.clientSecret,
    });
    this.accessToken = res.data.accessToken;
    this.tokenExpiry = Date.now() + (res.data.expireIn - 60) * 1000;
    return this.accessToken!;
  }

  async start(): Promise<void> {
    await this.refreshToken();
    logger.info('DingTalk channel started (Stream mode — register your DingTalk Stream endpoint)');
  }

  async stop(): Promise<void> {}

  async handleWebhook(body: Record<string, unknown>): Promise<void> {
    const text = String(body.text ?? (body.content as Record<string, unknown>)?.content ?? '');
    const chatId = String(body.conversationId ?? body.sessionWebhook ?? '');
    const senderId = String((body.senderStaffId ?? body.senderId) ?? '');

    const inbound: InboundMessage = {
      id: uuidv4(),
      groupId: `dingtalk_${chatId}`,
      channel: this.name,
      senderId,
      senderName: String(body.senderNick ?? senderId),
      text,
      timestamp: new Date(),
      isTrigger: true,
    };

    await this.handler?.(inbound);
  }

  async send(msg: OutboundMessage): Promise<void> {
    const token = await this.refreshToken();
    const chatId = msg.groupId.replace('dingtalk_', '');
    await axios.post(
      `https://api.dingtalk.com/v1.0/im/conversations/messages/send`,
      { robotCode: this.cfg.clientId, openConversationId: chatId, msgKey: 'sampleText', msgParam: JSON.stringify({ content: msg.text }) },
      { headers: { 'x-acs-dingtalk-access-token': token } },
    );
  }

  onMessage(handler: (msg: InboundMessage) => Promise<void>): void { this.handler = handler; }
}
