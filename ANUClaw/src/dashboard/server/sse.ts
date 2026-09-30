import { Response } from 'express';
import { AuthRequest } from './auth';
import { eventBus, DashboardEvent } from '../../eventbus';

const clients = new Set<Response>();

export function sseHandler(req: AuthRequest, res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (evt: DashboardEvent) => {
    res.write(`data: ${JSON.stringify(evt)}\n\n`);
  };

  // Send heartbeat every 20s to keep connection alive
  const hb = setInterval(() => res.write(': ping\n\n'), 20_000);

  eventBus.on('event', send);
  clients.add(res);

  req.on('close', () => {
    clearInterval(hb);
    eventBus.off('event', send);
    clients.delete(res);
  });
}

export function connectedClients(): number {
  return clients.size;
}
