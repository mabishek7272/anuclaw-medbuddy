/**
 * Explanation-layer types (plan §2.1 Explanation layer, §3.1 stages 13–14, §4).
 *
 * The LLM explanation layer is the ONLY place a model touches the output, and it
 * is strictly non-authoritative: it narrates the arbitrated verdict and CANNOT
 * alter it. To keep `src/cds` free of any model dependency, the layer is
 * LLM-agnostic — a model is injected via `ExplanationProvider`. The default
 * provider is a deterministic template that is verdict-faithful by construction.
 *
 * Every generated narrative passes through the consistency guard (§2.2): if it
 * contradicts the verdict it is discarded and regenerated; after N failures the
 * system escalates rather than presenting an untrustworthy narrative.
 */

import { Verdict, VerdictDecision } from '../safety/types';

/** The clinical directive a narrative conveys, used by the consistency guard. */
export type Directive = 'use' | 'avoid' | 'adjust' | 'none';

/** Structured claims a narrator MUST emit alongside prose, for exact checking. */
export interface NarrativeAssertions {
  decision: VerdictDecision;
  drug: string;
  gene?: string;
  phenotype?: string;
  directive: Directive;
}

/** A narrator's output: human prose plus the structured claims it makes. */
export interface NarrativeDraft {
  prose: string;
  assertions: NarrativeAssertions;
}

/** Minimal context the verdict does not itself carry. */
export interface ExplanationContext {
  gene: string;
  drug: string;
}

export interface ProviderInput {
  prompt: string;
  verdict: Verdict;
  context: ExplanationContext;
  /** 1-based attempt number (lets a provider vary output on regeneration). */
  attempt: number;
}

/**
 * A pluggable narrator. The default is deterministic; an Anthropic-backed
 * provider implementing this interface is wired OUTSIDE `src/cds` so the
 * decision core stays model-free.
 */
export interface ExplanationProvider {
  name: string;
  generate(input: ProviderInput): NarrativeDraft | Promise<NarrativeDraft>;
}

export interface ConsistencyResult {
  consistent: boolean;
  violations: string[];
}

export type ExplanationStatus =
  /** Default deterministic template, passed the guard. */
  | 'template'
  /** An injected LLM narrative, passed the guard. */
  | 'llm'
  /** Provider unavailable/errored → safe template, flagged (§3.3). */
  | 'template_fallback'
  /** N consistency failures → escalated to human; narrative suppressed (§3.2). */
  | 'escalated';

export type ExplanationAuditEvent =
  | { type: 'explanation.generated'; attempt: number; source: string }
  | { type: 'consistency.verified'; attempt: number; status: 'pass' | 'fail'; violations: string[] }
  | { type: 'explanation.fault'; attempt: number; detail: string };

export interface ExplanationResult {
  status: ExplanationStatus;
  /** Plain-language narrative; `null` when escalated with no narrative (§3.2). */
  narrative: string | null;
  assertions: NarrativeAssertions | null;
  source: string;
  attempts: number;
  /** True when a human must review the explanation handling. */
  escalate_to_human: boolean;
  /** True when the narrative is anything other than a clean first-class pass. */
  flagged: boolean;
  /** The final consistency-guard result. */
  consistency: ConsistencyResult;
  audit_events: ExplanationAuditEvent[];
}

export interface GenerateExplanationOptions {
  provider?: ExplanationProvider;
  /** Max generation attempts before escalation (default 3). */
  maxAttempts?: number;
}
