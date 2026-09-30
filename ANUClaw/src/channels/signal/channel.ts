import { spawn, ChildProcess } from 'child_process';
import { IChannel, InboundMessage, OutboundMessage } from '../types';
import { logger } from '../../logger';
import { v4 as uuidv4 } from 'uuid';

interface SignalConfig { cliPath: string; phoneNumber: string }

export class SignalChannel implements IChannel {
  readonly name = 'signal';
  private handler?: (msg: InboundMessage) => Promise<void>;
  private proc?: ChildProcess;

  constructor(private cfg: SignalConfig) {}

  async start(): Promise<void> {
    this.proc = spawn(this.cfg.cliPath, ['--output=json', 'receive', '-a', this.cfg.phoneNumber], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.proc.stdout?.on('data', async (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const msg = JSON.parse(line) as Record<string, unknown>;
          const envelope = (msg.envelope ?? msg) as Record<string, unknown>;
          const dataMsg = envelope.dataMessage as Record<string, unknown> | undefined;
          if (!dataMsg?.message) continue;

          const inbound: InboundMessage = {
            id: uuidv4(),
            groupId: `signal_${String(envelope.sourceNumber ?? envelope.source ?? 'unknown')}`,
            channel: this.name,
            senderId: String(envelope.sourceNumber ?? ''),
            senderName: String(envelope.sourceName ?? envelope.sourceNumber ?? ''),
            text: String(dataMsg.message),
            timestamp: new Date(),
            isTrigger: true,
          };

          await this.handler?.(inbound);
        } catch {
          // non-JSON line — skip
        }
      }
    });

    logger.info('Signal channel started (signal-cli)');
  }

  async stop(): Promise<void> { this.proc?.kill(); }

  async send(msg: OutboundMessage): Promise<void> {
    const recipient = msg.groupId.replace('signal_', '');
    const args = ['-a', this.cfg.phoneNumber, 'send', '-m', msg.text, recipient];
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(this.cfg.cliPath, args);
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`signal-cli exited ${code}`))));
    });
  }

  onMessage(handler: (msg: InboundMessage) => Promise<void>): void { this.handler = handler; }
}
