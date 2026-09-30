/**
 * Explanation Service (plan §3.1 stages 13–14, §3.2, §3.3).
 *
 * Orchestrates constrained generation + the consistency guard:
 *   1. Build a constrained prompt from the verdict (stage 13).
 *   2. Ask the provider for a narrative; verify it against the verdict (stage 14).
 *   3. If it contradicts the verdict, discard and regenerate — up to N attempts.
 *   4. After N failures, ESCALATE to a human with no narrative (§3.2).
 *   5. If the provider is unavailable/errors, fall back to the deterministic
 *      template, flagged (§3.3).
 *
 * The decision is NEVER changed to match the narrative. The default provider is
 * deterministic and verdict-faithful, so the LLM-free path always succeeds on
 * the first attempt.
 */

import { Verdict } from '../safety/types';
import { buildExplanationPrompt } from './prompt';
import { checkConsistency } from './consistency-guard';
import {
  deterministicTemplateProvider,
  renderTemplate,
} from './template-provider';
import {
  ConsistencyResult,
  ExplanationAuditEvent,
  ExplanationContext,
  ExplanationResult,
  GenerateExplanationOptions,
  NarrativeDraft,
} from './types';

export async function generateExplanation(
  verdict: Verdict,
  context: ExplanationContext,
  options: GenerateExplanationOptions = {},
): Promise<ExplanationResult> {
  const provider = options.provider ?? deterministicTemplateProvider;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const isLlm = provider !== deterministicTemplateProvider;
  const prompt = buildExplanationPrompt(verdict, context);
  const audit: ExplanationAuditEvent[] = [];

  let lastConsistency: ConsistencyResult = { consistent: false, violations: [] };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let draft: NarrativeDraft;
    try {
      draft = await provider.generate({ prompt, verdict, context, attempt });
    } catch (err) {
      // (§3.3) Provider unavailable → safe template fallback, flagged.
      audit.push({
        type: 'explanation.fault',
        attempt,
        detail: `provider error: ${err instanceof Error ? err.message : String(err)}`,
      });
      return templateFallback(verdict, context, attempt, audit);
    }

    audit.push({ type: 'explanation.generated', attempt, source: provider.name });

    const consistency = checkConsistency(verdict, context, draft);
    lastConsistency = consistency;
    audit.push({
      type: 'consistency.verified',
      attempt,
      status: consistency.consistent ? 'pass' : 'fail',
      violations: consistency.violations,
    });

    if (consistency.consistent) {
      return {
        status: isLlm ? 'llm' : 'template',
        narrative: draft.prose,
        assertions: draft.assertions,
        source: provider.name,
        attempts: attempt,
        escalate_to_human: false,
        flagged: false,
        consistency,
        audit_events: audit,
      };
    }

    // (§2.2) Contradiction is a critical fault: discard and regenerate.
    audit.push({
      type: 'explanation.fault',
      attempt,
      detail: `consistency failure: ${consistency.violations.join('; ')}`,
    });
  }

  // (§3.2) N failures → escalate to a human with no narrative.
  return {
    status: 'escalated',
    narrative: null,
    assertions: null,
    source: provider.name,
    attempts: maxAttempts,
    escalate_to_human: true,
    flagged: true,
    consistency: lastConsistency,
    audit_events: audit,
  };
}

function templateFallback(
  verdict: Verdict,
  context: ExplanationContext,
  attempt: number,
  audit: ExplanationAuditEvent[],
): ExplanationResult {
  const draft = renderTemplate(verdict, context);
  const consistency = checkConsistency(verdict, context, draft);
  audit.push({
    type: 'explanation.generated',
    attempt,
    source: deterministicTemplateProvider.name,
  });
  audit.push({
    type: 'consistency.verified',
    attempt,
    status: consistency.consistent ? 'pass' : 'fail',
    violations: consistency.violations,
  });
  return {
    status: 'template_fallback',
    narrative: draft.prose,
    assertions: draft.assertions,
    source: deterministicTemplateProvider.name,
    attempts: attempt,
    escalate_to_human: false,
    flagged: true,
    consistency,
    audit_events: audit,
  };
}
