import { createClient, MatrixClient, EventType, MsgType } from 'matrix-js-sdk';
import { IChannel, InboundMessage, OutboundMessage } from '../types';
import { logger } from '../../logger';
import { v4 as uuidv4 } from 'uuid';

interface MatrixConfig { homeserverUrl: string; userId: string; accessToken: string; roomId: string }

export class MatrixChannel implements IChannel {
  readonly name = 'matrix';
  private client: MatrixClient;
  private handler?: (msg: InboundMessage) => Promise<void>;

  constructor(private cfg: MatrixConfig) {
    this.client = createClient({ baseUrl: cfg.homeserverUrl, userId: cfg.userId, accessToken: cfg.accessToken });
  }

  async start(): Promise<void> {
    this.client.on('Room.timeline' as unknown as Parameters<typeof this.client.on>[0], async (event: unknown) => {
      const e = event as { getType: () => string; getSender: () => string; getContent: () => { msgtype?: string; body?: string }; getId: () => string };
      if (e.getType() !== 'm.room.message') return;
      if (e.getSender() === this.cfg.userId) return;
      const content = e.getContent();
      if (content.msgtype !== 'm.text') return;

      const inbound: InboundMessage = {
        id: uuidv4(),
        groupId: `matrix_${this.cfg.roomId}`,
        channel: this.name,
        senderId: e.getSender(),
        senderName: e.getSender(),
        text: content.body ?? '',
        timestamp: new Date(),
        isTrigger: true,
      };

      await this.handler?.(inbound);
    });

    await this.client.startClient({ initialSyncLimit: 0 });
    logger.info('Matrix channel started');
  }

  async stop(): Promise<void> { this.client.stopClient(); }

  async send(msg: OutboundMessage): Promise<void> {
    const roomId = msg.groupId.replace('matrix_', '');
    await this.client.sendMessage(roomId, { msgtype: 'm.text', body: msg.text } as any);
  }

  onMessage(handler: (msg: InboundMessage) => Promise<void>): void { this.handler = handler; }
}
