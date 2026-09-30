/**
 * Constrained-generation prompt builder (plan §4 "Constrained generation with
 * guardrails").
 *
 * The prompt gives a narrator ONLY the arbitrated verdict + evidence and binds
 * it to (a) never alter the decision, (b) emit a structured `assertions` block
 * that the consistency guard checks, and (c) describe — not decide. This is the
 * text an injected LLM provider would receive; the deterministic template
 * provider ignores it and builds prose directly from the verdict.
 */

import { Verdict } from '../safety/types';
import { ExplanationContext } from './types';
import { expectedDirective } from './directive';

export function buildExplanationPrompt(
  verdict: Verdict,
  context: ExplanationContext,
): string {
  const facts = {
    decision: verdict.decision,
    reason_code: verdict.reason_code,
    drug: context.drug,
    gene: context.gene,
    phenotype: verdict.phenotype?.phenotype ?? null,
    recommendation: verdict.recommendation?.recommendation ?? null,
    strength: verdict.recommendation?.strength ?? null,
    blocks: verdict.blocks.map((b) => b.message),
    warnings: verdict.warnings.map((w) => w.message),
    evidence: verdict.evidence
      ? {
          confidence: verdict.evidence.confidence_level,
          sources: verdict.evidence.evidence_used,
        }
      : null,
    required_directive: expectedDirective(verdict),
  };

  return [
    'You are the explanation layer of a clinical decision support system.',
    'You DESCRIBE a decision that has already been made by deterministic rules.',
    'You MUST NOT change, soften, or contradict the decision. You decide nothing.',
    '',
    'Rules:',
    '- Narrate only the facts below. Do not introduce drugs, doses, or advice not present.',
    `- The clinical directive you convey MUST be "${facts.required_directive}".`,
    '- If the decision is "block" you must make clear the drug must NOT be used as prescribed.',
    '- If the decision is "cannot_advise" or "no_guideline" you must NOT give a dosing directive.',
    '- Return STRICT JSON: { "prose": string, "assertions": { "decision", "drug", "gene", "phenotype", "directive" } }.',
    '',
    'VERDICT FACTS (authoritative — do not alter):',
    JSON.stringify(facts, null, 2),
  ].join('\n');
}
