import { IChannel, InboundMessage, OutboundMessage } from '../types';
import { logger } from '../../logger';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';
import axios from 'axios';

interface EmailConfig { clientId: string; clientSecret: string; refreshToken: string; address: string }

export class EmailChannel implements IChannel {
  readonly name = 'email';
  private handler?: (msg: InboundMessage) => Promise<void>;
  private transporter?: nodemailer.Transporter;
  private pollInterval?: NodeJS.Timeout;
  private lastCheck = new Date();

  constructor(private cfg: EmailConfig) {}

  async start(): Promise<void> {
    const token = await this.getAccessToken();
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { type: 'OAuth2', user: this.cfg.address, clientId: this.cfg.clientId, clientSecret: this.cfg.clientSecret, refreshToken: this.cfg.refreshToken, accessToken: token },
    });

    // Poll for new emails every 60 seconds
    this.pollInterval = setInterval(() => this.checkInbox(), 60_000);
    logger.info('Email channel started (Gmail OAuth2, polling every 60s)');
  }

  async stop(): Promise<void> {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  private async getAccessToken(): Promise<string> {
    const res = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
      refresh_token: this.cfg.refreshToken,
      grant_type: 'refresh_token',
    });
    return res.data.access_token;
  }

  private async checkInbox(): Promise<void> {
    // Simplified — use googleapis library for production
    logger.debug('Email: checking inbox...');
  }

  async send(msg: OutboundMessage): Promise<void> {
    const to = msg.groupId.replace('email_', '');
    await this.transporter?.sendMail({
      from: this.cfg.address,
      to,
      subject: 'ANUClaw Response',
      text: msg.text,
    });
  }

  onMessage(handler: (msg: InboundMessage) => Promise<void>): void { this.handler = handler; }
}
