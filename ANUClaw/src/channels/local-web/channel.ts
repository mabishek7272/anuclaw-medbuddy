import express, { Request, Response } from 'express';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { IChannel, InboundMessage, OutboundMessage } from '../types';
import { logger } from '../../logger';
import { v4 as uuidv4 } from 'uuid';

interface WebConfig {
  host: string;
  port: number;
  password: string;
}

interface SSEClient {
  groupId: string;
  res: Response;
}

export class LocalWebChannel implements IChannel {
  readonly name = 'web';
  private app = express();
  private server?: http.Server;
  private handler?: (msg: InboundMessage) => Promise<void>;
  private sseClients: SSEClient[] = [];
  private cfg: WebConfig;
  private pendingMessages = new Map<string, OutboundMessage[]>();

  constructor(cfg: WebConfig) {
    this.cfg = cfg;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'public')));

    // Auth middleware
    this.app.use((req, res, next) => {
      if (!this.cfg.password) return next();
      const token = req.headers['x-anuclaw-token'] ?? req.query.token;
      if (token !== this.cfg.password) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      next();
    });

    // List threads
    this.app.get('/api/threads', (_req, res) => {
      res.json({ threads: Array.from(this.pendingMessages.keys()) });
    });

    // Send message from web UI
    this.app.post('/api/message', async (req: Request, res: Response) => {
      const { groupId = `web_${uuidv4().slice(0, 8)}`, text } = req.body as { groupId?: string; text: string };
      if (!text?.trim()) { res.status(400).json({ error: 'text required' }); return; }

      const inbound: InboundMessage = {
        id: uuidv4(),
        groupId: `web_${groupId}`,
        channel: this.name,
        senderId: 'web-user',
        senderName: 'You',
        text: text.trim(),
        timestamp: new Date(),
        isTrigger: true,
      };

      await this.handler?.(inbound);
      res.json({ ok: true, groupId: inbound.groupId, messageId: inbound.id });
    });

    // SSE stream for responses
    this.app.get('/api/stream/:groupId', (req: Request, res: Response) => {
      const { groupId } = req.params as { groupId: string };
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const client: SSEClient = { groupId, res };
      this.sseClients.push(client);

      req.on('close', () => {
        this.sseClients = this.sseClients.filter((c) => c !== client);
      });
    });

    // Health
    this.app.get('/health', (_req, res) => {
      res.json({ status: 'ok', name: 'ANUClaw', version: '1.0.0' });
    });
  }

  async start(): Promise<void> {
    this.server = this.app.listen(this.cfg.port, this.cfg.host, () => {
      logger.info(`Web UI available at http://${this.cfg.host}:${this.cfg.port}`);
    });
  }

  async stop(): Promise<void> {
    this.server?.close();
  }

  async send(msg: OutboundMessage): Promise<void> {
    const clients = this.sseClients.filter((c) => c.groupId === msg.groupId || c.groupId === msg.groupId.replace('web_', ''));
    const data = JSON.stringify({ text: msg.text, filePath: msg.filePath, ts: Date.now() });
    for (const client of clients) {
      client.res.write(`data: ${data}\n\n`);
    }
  }

  onMessage(handler: (msg: InboundMessage) => Promise<void>): void {
    this.handler = handler;
  }
}
