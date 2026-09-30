import { logger } from './logger';

// ── Types ────────────────────────────────────────────────────────────────────

export type HookEvent =
  | 'BeforeMessage'
  | 'BeforeLLMCall'
  | 'BeforeToolCall'
  | 'AfterToolCall'
  | 'AfterMessage';

export type HookOutcome = 'allow' | 'block' | 'modify';

export interface HookContext {
  event: HookEvent;
  chatId: string;
  channel: string;
  userId?: string;
  /** The payload being processed — mutate this to modify behaviour */
  payload: Record<string, unknown>;
}

export interface HookResult {
  outcome: HookOutcome;
  /** Optional reason shown in logs when outcome is 'block' */
  reason?: string;
  /** Modified payload when outcome is 'modify' */
  payload?: Record<string, unknown>;
}

export type HookHandler = (ctx: HookContext) => Promise<HookResult> | HookResult;

interface HookRegistration {
  name: string;
  event: HookEvent;
  handler: HookHandler;
  priority: number;
}

// ── Registry ─────────────────────────────────────────────────────────────────

const registry: HookRegistration[] = [];

export function registerHook(
  name: string,
  event: HookEvent,
  handler: HookHandler,
  priority = 100,
): void {
  registry.push({ name, event, handler, priority });
  registry.sort((a, b) => a.priority - b.priority);
  logger.debug(`Hook registered: ${name} → ${event} (priority ${priority})`);
}

// ── Engine ────────────────────────────────────────────────────────────────────

export async function runHooks(
  event: HookEvent,
  chatId: string,
  channel: string,
  payload: Record<string, unknown>,
  userId?: string,
): Promise<{ allowed: boolean; payload: Record<string, unknown>; blockedBy?: string }> {
  const handlers = registry.filter((r) => r.event === event);

  let currentPayload = { ...payload };

  for (const reg of handlers) {
    const ctx: HookContext = {
      event,
      chatId,
      channel,
      userId,
      payload: currentPayload,
    };

    let result: HookResult;
    try {
      result = await reg.handler(ctx);
    } catch (err) {
      logger.error(`Hook ${reg.name} threw an error:`, err);
      continue;
    }

    if (result.outcome === 'block') {
      logger.info(`Hook ${reg.name} blocked ${event} for chat ${chatId}: ${result.reason ?? ''}`);
      return { allowed: false, payload: currentPayload, blockedBy: reg.name };
    }

    if (result.outcome === 'modify' && result.payload) {
      currentPayload = result.payload;
    }
  }

  return { allowed: true, payload: currentPayload };
}

// ── Built-in hooks ────────────────────────────────────────────────────────────

/** Block messages containing prompt-injection markers */
registerHook(
  'prompt-injection-guard',
  'BeforeMessage',
  (ctx) => {
    const text = String(ctx.payload.text ?? '');
    const injectionPatterns = [
      /ignore previous instructions/i,
      /disregard all prior/i,
      /\bsystem prompt\b.*\bignore\b/i,
      /<\/?system>/i,
    ];
    for (const pattern of injectionPatterns) {
      if (pattern.test(text)) {
        return { outcome: 'block', reason: 'Potential prompt injection detected' };
      }
    }
    return { outcome: 'allow' };
  },
  10,
);

/** Log every LLM call for observability */
registerHook(
  'llm-call-logger',
  'BeforeLLMCall',
  (ctx) => {
    logger.debug(`LLM call — chat:${ctx.chatId} channel:${ctx.channel} model:${ctx.payload.model}`);
    return { outcome: 'allow' };
  },
  200,
);

/** Audit tool calls to structured log */
registerHook(
  'tool-call-auditor',
  'BeforeToolCall',
  (ctx) => {
    logger.info(`Tool call — ${ctx.payload.tool} — chat:${ctx.chatId}`);
    return { outcome: 'allow' };
  },
  200,
);

/** HIPAA-aware: redact likely PHI from outbound messages */
registerHook(
  'phi-redaction-guard',
  'AfterMessage',
  (ctx) => {
    const text = String(ctx.payload.text ?? '');
    // Simple SSN pattern detection
    const ssnPattern = /\b\d{3}-\d{2}-\d{4}\b/g;
    if (ssnPattern.test(text)) {
      logger.warn(`Possible SSN detected in response for chat ${ctx.chatId} — redacting`);
      const redacted = text.replace(ssnPattern, '[REDACTED]');
      return { outcome: 'modify', payload: { ...ctx.payload, text: redacted } };
    }
    return { outcome: 'allow' };
  },
  50,
);
