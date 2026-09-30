/**
 * Clinical LLM client for E-LAB assistive tools (Wave 2).
 *
 * RESPONSIBILITY MODEL — these tools are ASSISTIVE and NON-DIAGNOSTIC:
 *  - The LLM never decides, diagnoses, or prescribes. Its output is supporting
 *    text that a clinician MUST verify (human-in-the-loop).
 *  - It can NEVER override the deterministic clinical engine. A second opinion
 *    that conflicts with an engine `block` must defer to the block.
 *  - Grounding: extraction must quote the source verbatim; nothing is invented.
 *  - temperature 0 + recorded model + prompt_version for reproducibility
 *    (class: snapshot_only_external — an LLM is not bit-reproducible).
 *
 * Provider-aware (uses the project's configured provider) and fails CLOSED with
 * a clear error when no provider/key is configured — never a silent fallback.
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config';

export const PROMPT_VERSION = 'elab-clin-v1';
const TEMPERATURE = 0;

export interface LlmProvenance {
  provider: string;
  model: string;
  prompt_version: string;
  temperature: number;
  generated_at: string;
}

export class LlmUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = 'LlmUnavailableError'; }
}

function resolveProvider(): { kind: 'anthropic' | 'openai'; model: string; client: OpenAI | Anthropic; provider: string } {
  const l = config.llm;
  if (l.provider === 'anthropic' && l.anthropicApiKey) {
    return { kind: 'anthropic', provider: 'anthropic', model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6', client: new Anthropic({ apiKey: l.anthropicApiKey }) };
  }
  if (l.provider === 'openrouter' && l.openrouterApiKey) {
    return {
      kind: 'openai', provider: 'openrouter',
      model: l.openrouterModel ?? 'anthropic/claude-sonnet-4-6',
      client: new OpenAI({ apiKey: l.openrouterApiKey, baseURL: l.openrouterBaseUrl ?? 'https://openrouter.ai/api/v1' }),
    };
  }
  if (l.provider === 'openai-compatible' && l.openaiCompatibleApiKey && l.openaiCompatibleBaseUrl) {
    return {
      kind: 'openai', provider: 'openai-compatible',
      model: l.openaiCompatibleModel ?? 'gpt-4o',
      client: new OpenAI({ apiKey: l.openaiCompatibleApiKey, baseURL: l.openaiCompatibleBaseUrl }),
    };
  }
  // Last resort: an Anthropic key present even if provider set elsewhere.
  if (l.anthropicApiKey) {
    return { kind: 'anthropic', provider: 'anthropic', model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6', client: new Anthropic({ apiKey: l.anthropicApiKey }) };
  }
  throw new LlmUnavailableError('No LLM provider configured. Set MODEL_PROVIDER + an API key (.env) to use the assistive clinical tools.');
}

const GUARDRAIL = [
  'You are an ASSISTIVE clinical documentation aid inside a research tool. You are NOT a clinician.',
  'You do NOT diagnose, do NOT prescribe, and do NOT make treatment decisions. Your output is a draft that a licensed clinician must independently verify.',
  'NEVER invent facts. Only use information explicitly present in the provided input. If a field is not stated, leave it empty/null — do not guess.',
  'You cannot override safety rules: if a deterministic engine has BLOCKED something, you must defer to that block and never recommend against it.',
  'Respond with ONLY a single valid JSON object — no prose, no markdown fences, no commentary.',
].join('\n');

async function rawComplete(system: string, user: string, maxTokens: number): Promise<{ text: string; prov: LlmProvenance }> {
  const r = resolveProvider();
  const generated_at = new Date().toISOString();
  const prov: LlmProvenance = { provider: r.provider, model: r.model, prompt_version: PROMPT_VERSION, temperature: TEMPERATURE, generated_at };
  const fullSystem = `${GUARDRAIL}\n\n${system}`;

  if (r.kind === 'anthropic') {
    const a = r.client as Anthropic;
    const resp = await a.messages.create({ model: r.model, max_tokens: maxTokens, temperature: TEMPERATURE, system: fullSystem, messages: [{ role: 'user', content: user }] });
    const text = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
    return { text, prov };
  }
  const o = r.client as OpenAI;
  const resp = await o.chat.completions.create({
    model: r.model, temperature: TEMPERATURE, max_tokens: maxTokens,
    messages: [{ role: 'system', content: fullSystem }, { role: 'user', content: user }],
  });
  return { text: resp.choices[0]?.message?.content ?? '', prov };
}

function extractJson(text: string): any {
  let t = text.trim();
  // Strip markdown fences if the model added them despite instructions.
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first === -1 || last === -1) throw new Error('LLM did not return JSON');
  return JSON.parse(t.slice(first, last + 1));
}

/** Complete + parse strict JSON (one retry with a stricter nudge on parse fail). */
export async function completeJson<T = any>(system: string, user: string, maxTokens = 1500): Promise<{ data: T; provenance: LlmProvenance }> {
  const first = await rawComplete(system, user, maxTokens);
  try {
    return { data: extractJson(first.text) as T, provenance: first.prov };
  } catch {
    const retry = await rawComplete(system, `${user}\n\nIMPORTANT: your previous reply was not valid JSON. Reply with ONLY a single JSON object.`, maxTokens);
    return { data: extractJson(retry.text) as T, provenance: retry.prov };
  }
}

/** Standard envelope stamped on every assistive response. */
export interface PhiHandling {
  deidentified: boolean;
  baa_covered: boolean;
  redactions: number;
  residual_risk?: 'low' | 'residual';
}

/** Is the configured model provider declared BAA-covered? (env, default false) */
export function isBaaCovered(): boolean {
  return process.env.LLM_BAA_COVERED === 'true';
}
/** Must clinical free text be de-identified before egress? (env, default true) */
export function deidRequired(): boolean {
  return process.env.ELAB_DEID_REQUIRED !== 'false';
}

export function safetyEnvelope(provenance: LlmProvenance, phi?: PhiHandling) {
  const baa = phi?.baa_covered ?? isBaaCovered();
  const disclaimer = baa
    ? 'AI-assisted draft — non-diagnostic. A licensed clinician must independently verify. Provider is declared BAA-covered.'
    : phi?.deidentified
      ? `AI-assisted draft — non-diagnostic. Input was DE-IDENTIFIED before being sent to a non-BAA provider (${phi.redactions} identifier(s) redacted) and re-identified locally. Residual re-identification risk remains; clinician must verify.`
      : 'AI-assisted draft — non-diagnostic. Input was sent to the configured model provider. A licensed clinician must independently verify.';
  return {
    assistive: true,
    not_diagnostic: true,
    needs_human_review: true,
    reproducibility_class: 'snapshot_only_external' as const,
    phi: phi ?? { deidentified: false, baa_covered: baa, redactions: 0 },
    disclaimer,
    provenance,
  };
}
