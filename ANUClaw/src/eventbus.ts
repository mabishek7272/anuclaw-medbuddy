import { EventEmitter } from 'events';

export type DashboardEventType =
  | 'message.received'
  | 'message.sent'
  | 'hook.fired'
  | 'llm.call.started'
  | 'llm.call.completed'
  | 'tool.invoked'
  | 'tool.completed'
  | 'task.executed'
  | 'channel.status'
  | 'audit.event';

export interface DashboardEvent {
  type: DashboardEventType;
  ts: number;
  payload: Record<string, unknown>;
}

class EventBus extends EventEmitter {
  emit(event: string, data: DashboardEvent): boolean {
    return super.emit(event, data);
  }

  publish(type: DashboardEventType, payload: Record<string, unknown>): void {
    const evt: DashboardEvent = { type, ts: Date.now(), payload };
    this.emit('event', evt);
    this.emit(type, evt);
  }
}

export const eventBus = new EventBus();
eventBus.setMaxListeners(200);
