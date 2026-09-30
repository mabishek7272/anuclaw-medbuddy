/**
 * Generalized clinical arbitration + INV-ORIG enforcement (Phase 0, WS-E).
 *
 * Reconciles a deterministic candidate, evidence grounding, and safety findings
 * into one `ClinicalVerdict`. Precedence (highest first):
 *   1. missing data        → cannot_advise
 *   2. any safety BLOCK     → block
 *   3. no candidate         → no_guideline
 *   4. evidence ungrounded  → cannot_advise (no-citation block)
 *   5. otherwise            → recommend
 *
 * INV-ORIG: a `recommend` is permitted ONLY if the candidate was originated by a
 * deterministic rule. Engine/ML `supporting_evidence` never originates — there
 * is no code path here that turns supporting evidence into a candidate. The
 * `verdict_hash` binds the supporting-evidence provenance (gate Spec 4) so two
 * different engine runs cannot collide to the same hash.
 */

import { contentHash } from '../hashing';
import { SafetyFinding } from '../safety/types';
import {
  CandidateRecommendation,
  ClinicalDecision,
  ClinicalVerdict,
  Confidence,
  EvidenceCitation,
  SupportingEvidenceItem,
} from './types';

export interface AssembleInput {
  domain: string;
  rule_version: string;
  missingData: boolean;
  candidate: CandidateRecommendation | null;
  citations: EvidenceCitation[];
  /** false if any required citation failed to resolve. */
  evidenceGrounded: boolean;
  blocks: SafetyFinding[];
  warnings: SafetyFinding[];
  supporting: SupportingEvidenceItem[];
}

export class OriginationInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OriginationInvariantError';
  }
}

export function assembleVerdict(i: AssembleInput): ClinicalVerdict {
  let decision: ClinicalDecision;
  let reason_code: string;
  let recommendation: CandidateRecommendation | null = null;

  if (i.missingData) {
    decision = 'cannot_advise';
    reason_code = 'missing_data';
  } else if (i.blocks.length > 0) {
    decision = 'block';
    reason_code = 'safety_block';
  } else if (!i.candidate) {
    decision = 'no_guideline';
    reason_code = 'no_guideline_available';
  } else if (!i.evidenceGrounded) {
    decision = 'cannot_advise';
    reason_code = 'evidence_unavailable';
  } else {
    // INV-ORIG: defense-in-depth — a recommendation must be rule-originated.
    if (i.candidate.originated_by !== 'deterministic_rule') {
      throw new OriginationInvariantError(
        'INV-ORIG: recommendation was not originated by a deterministic rule',
      );
    }
    decision = 'recommend';
    reason_code = i.warnings.length > 0 ? 'recommend_with_warnings' : 'recommend';
    recommendation = i.candidate;
  }

  const confidence: Confidence =
    decision === 'recommend' ? (i.warnings.length > 0 ? 'reduced' : 'high') : 'none';

  // Deterministic hash content — binds engine provenance (Spec 4), excludes clock.
  const hashContent = {
    domain: i.domain,
    decision,
    reason_code,
    recommendation,
    citations: i.citations.map((c) => c.id),
    blocks: i.blocks,
    warnings: i.warnings,
    supporting: i.supporting.map((s) => ({
      engine_id: s.engine_id,
      engine_version: s.engine_version,
      input_hash: s.input_hash,
      kind: s.kind,
    })),
    rule_version: i.rule_version,
  };

  return {
    domain: i.domain,
    decision,
    reason_code,
    recommendation,
    citations: decision === 'recommend' ? i.citations : [],
    blocks: i.blocks,
    warnings: i.warnings,
    supporting_evidence: i.supporting,
    confidence,
    rule_version: i.rule_version,
    verdict_hash: contentHash(hashContent),
  };
}
