import { IChannel, InboundMessage, OutboundMessage } from '../types';
import { logger } from '../../logger';
import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';

interface NostrConfig { privateKey: string; relay: string }

export class NostrChannel implements IChannel {
  readonly name = 'nostr';
  private handler?: (msg: InboundMessage) => Promise<void>;
  private ws?: WebSocket;
  private pubkey?: string;

  constructor(private cfg: NostrConfig) {}

  async start(): Promise<void> {
    // Derive pubkey from private key (simplified — use nostr-tools in production)
    this.ws = new WebSocket(this.cfg.relay);
    this.ws.on('open', () => {
      logger.info(`Nostr channel connected to ${this.cfg.relay}`);
      // Subscribe to mentions
      const sub = ['REQ', 'anuclaw-sub', { kinds: [1], '#p': [this.pubkey ?? ''], limit: 0 }];
      this.ws?.send(JSON.stringify(sub));
    });

    this.ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString()) as unknown[];
        if (msg[0] !== 'EVENT') return;
        const event = msg[2] as { id: string; pubkey: string; content: string; created_at: number };

        const inbound: InboundMessage = {
          id: uuidv4(),
          groupId: `nostr_${event.pubkey}`,
          channel: this.name,
          senderId: event.pubkey,
          senderName: event.pubkey.slice(0, 8) + '…',
          text: event.content,
          timestamp: new Date(event.created_at * 1000),
          isTrigger: true,
        };

        await this.handler?.(inbound);
      } catch {
        // non-JSON or non-event — skip
      }
    });

    this.ws.on('error', (err) => logger.error('Nostr WS error:', err));
  }

  async stop(): Promise<void> { this.ws?.close(); }

  async send(msg: OutboundMessage): Promise<void> {
    logger.info(`Nostr send (stub) → ${msg.groupId}: ${msg.text.slice(0, 80)}`);
    // Full implementation: sign event with private key then publish
  }

  onMessage(handler: (msg: InboundMessage) => Promise<void>): void { this.handler = handler; }
}
