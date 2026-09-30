/**
 * Clinician review service (plan §5.3 Human-in-the-Loop).
 *
 * Framework-agnostic. `evaluateForReview` runs the pipeline for an order and
 * returns review items (card + the full verdict hash the clinician will sign).
 * `submitSignOff` records the clinician's Accept / Modify / Reject decision to
 * the audit log — a modification or override requires a structured reason.
 *
 * No recommendation reaches the patient without this step (plan §5.3).
 */

import { AuditEntry, SignOffParams } from '../audit/types';
import { AuditLog } from '../audit/audit-log';
import { CdsCard, CdsHookRequest, CdsIndicator } from '../fhir/types';
import { VerdictDecision } from '../safety/types';
import { EvaluationItem, HandleHookOptions, evaluateRequest } from '../hooks/cds-hooks';

export interface ReviewItem {
  gene: string;
  drug: string;
  /** The verdict hash the clinician signs off against (audit linkage). */
  verdict_hash: string;
  decision: VerdictDecision;
  indicator: CdsIndicator;
  /** Whether the explanation was escalated (no narrative) and needs attention. */
  escalated: boolean;
  card: CdsCard;
}

export interface ReviewEvaluation {
  patientId: string;
  items: ReviewItem[];
}

export function toReviewItem(item: EvaluationItem): ReviewItem {
  return {
    gene: item.gene,
    drug: item.drug,
    verdict_hash: item.verdict.verdict_hash,
    decision: item.verdict.decision,
    indicator: item.card.indicator,
    escalated: item.explanation.escalate_to_human,
    card: item.card,
  };
}

export async function evaluateForReview(
  request: CdsHookRequest,
  options: HandleHookOptions = {},
): Promise<ReviewEvaluation> {
  const items = await evaluateRequest(request, options);
  return {
    patientId: request.context.patientId ?? 'unknown-patient',
    items: items.map(toReviewItem),
  };
}

/**
 * Record a clinician sign-off (plan §5.3 step 5, §5.4). Throws if a
 * modification/override is submitted without a structured reason. The returned
 * entry is hash-chained into the audit log.
 */
export function submitSignOff(params: SignOffParams, log: AuditLog): AuditEntry {
  return log.signOff(params);
}
