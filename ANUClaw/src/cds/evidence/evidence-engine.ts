/**
 * Clinical Evidence Engine (plan §4.3, §5.2).
 *
 * Resolves a fired rule's citation IDs against the pinned citation store and
 * returns a grounding result. Three outcomes:
 *   - grounded       : every citation resolves, versions pin, sources agree.
 *   - blocked        : a citation fails to resolve, or a CPIC citation's version
 *                      does not match the rule's pinned version → the
 *                      recommendation is BLOCKED (plan §4.3 "no-citation block",
 *                      §3.3 "Evidence retrieval empty -> Block recommendation").
 *   - contradiction  : a resolved source disagrees with the recommendation →
 *                      route to human (plan §4.3 "Contradiction detection").
 *
 * Pure and deterministic; the store defaults to the sealed registry copy but is
 * injectable for testing.
 */

import { CpicRule } from '../types';
import { loadCitations } from '../registry';
import {
  Citation,
  CitationStore,
  EvidenceObject,
  EvidenceResult,
  EvidenceUsedItem,
} from './types';

const PHENOTYPE_ABBREV: Record<string, string> = {
  'Ultrarapid Metabolizer': 'um',
  'Rapid Metabolizer': 'rm',
  'Normal Metabolizer': 'nm',
  'Intermediate Metabolizer': 'im',
  'Poor Metabolizer': 'pm',
};

function ruleSlug(rule: CpicRule): string {
  const ph = PHENOTYPE_ABBREV[rule.phenotype] ?? 'unknown';
  return `${rule.gene.toLowerCase()}_${rule.drug}_${ph}`;
}

function confidenceFromStrength(
  strength: CpicRule['strength'],
): EvidenceObject['confidence_level'] {
  switch (strength) {
    case 'Strong':
      return 'High';
    case 'Moderate':
      return 'Moderate';
    default:
      return 'Low';
  }
}

function toEvidenceUsed(c: Citation): EvidenceUsedItem {
  return {
    source: c.guideline_version ? `${c.source} ${c.guideline_version}` : c.source,
    section: c.section,
    strength: c.strength ?? undefined,
    pmid: c.pmid,
  };
}

export interface GroundEvidenceInput {
  recommendation_id: string;
  rule: CpicRule;
}

export function groundEvidence(
  input: GroundEvidenceInput,
  store?: { table: CitationStore; integrity: string },
): EvidenceResult {
  const { table, integrity } = store ?? loadCitations();
  const { rule } = input;

  const resolved: Citation[] = [];
  const missing: string[] = [];
  for (const id of rule.citation_ids) {
    const c = table.citations[id];
    if (c) resolved.push(c);
    else missing.push(id);
  }

  const evidenceObject = (
    confidence: EvidenceObject['confidence_level'],
    uncertainty: string,
  ): EvidenceObject => ({
    recommendation_id: input.recommendation_id,
    rules_triggered: [ruleSlug(rule)],
    evidence_used: resolved.map(toEvidenceUsed),
    confidence_level: confidence,
    uncertainty,
  });

  const base = { missing_citation_ids: missing, table_version: table.version, table_hash: integrity };

  // (1) No-citation block — a fault; the recommendation cannot be grounded.
  if (missing.length > 0) {
    return {
      status: 'blocked',
      reason: `Unresolved citation(s): ${missing.join(', ')}.`,
      evidence: evidenceObject('Low', `Missing citations: ${missing.join(', ')}.`),
      ...base,
    };
  }

  // (2) Version pinning — CPIC guideline citations must match the rule version.
  const pinMismatch = resolved.filter(
    (c) =>
      c.source === 'CPIC' &&
      c.guideline_version !== undefined &&
      c.guideline_version !== rule.cpic_version,
  );
  if (pinMismatch.length > 0) {
    const ids = pinMismatch.map((c) => c.id).join(', ');
    return {
      status: 'blocked',
      reason: `Guideline version mismatch (rule pinned to ${rule.cpic_version}): ${ids}.`,
      evidence: evidenceObject('Low', `Version pinning failed for: ${ids}.`),
      ...base,
    };
  }

  // (3) Contradiction — a resolved source disagrees → route to human.
  const contradicting = resolved.filter((c) => c.supports === false);
  if (contradicting.length > 0) {
    const ids = contradicting.map((c) => c.id).join(', ');
    return {
      status: 'contradiction',
      reason: `Sources disagree with the recommendation: ${ids}. Routing to human review.`,
      evidence: evidenceObject('Low', `Contradictory sources: ${ids}.`),
      ...base,
    };
  }

  // (4) Grounded.
  const confidence = confidenceFromStrength(rule.strength);
  const uncertainty =
    confidence === 'High'
      ? 'None for this gene-drug-phenotype triple.'
      : `Recommendation strength is ${rule.strength}; clinician judgment advised.`;

  return {
    status: 'grounded',
    reason: 'All citations resolved, versions pinned, sources agree.',
    evidence: evidenceObject(confidence, uncertainty),
    ...base,
  };
}
