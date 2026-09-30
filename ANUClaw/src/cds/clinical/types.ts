/**
 * Generalized clinical decision model (Phase 0, WS-E) — gate specs Spec 2.
 *
 * The original CDS core is PGx-hardwired (phenotype → CpicRule, CPIC-only
 * citations). This generalizes the decision/evidence shape so ANY clinical
 * domain can plug in a `ClinicalDecisionModule` while reusing the same
 * mechanism (safety engines, audit, canonical hashing). Additive — it does not
 * modify the existing PGx path.
 *
 * INV-ORIG (the C2 fix): a `recommend` verdict may only be ORIGINATED by a
 * deterministic rule. Engine/ML outputs are passed as `supporting_evidence`
 * and can rank/annotate/contribute-to-block — never originate or upgrade.
 */

import { SafetyFinding } from '../safety/types';

export type ClinicalDecision = 'recommend' | 'block' | 'cannot_advise' | 'no_guideline';
export type Confidence = 'high' | 'reduced' | 'none';

export type ReproducibilityClass =
  | 'deterministic'
  | 'seed_reproducible_pinned_hw'
  | 'snapshot_only_external';

/** Only a deterministic rule may originate a recommendation (INV-ORIG). */
export interface CandidateRecommendation {
  recommendation: string;
  strength: string;
  regimen: string[];
  citation_ids: string[];
  originated_by: 'deterministic_rule';
}

export interface EvidenceCitation {
  id: string;
  source: string; // 'NCCN' | 'ESMO' | 'PubMed' | …
  section?: string;
  pmid?: string;
  statement: string;
}

/** Engine/ML evidence — supporting only, provenance-bound (gate Spec 4). */
export interface SupportingEvidenceItem {
  engine_id: string;
  engine_version: string;
  input_hash: string;
  kind: string; // 'synergy' | 'docking' | 'structure'
  summary: string;
  confidence?: number;
  reproducibility_class: ReproducibilityClass;
}

export interface ClinicalVerdict {
  domain: string;
  decision: ClinicalDecision;
  reason_code: string;
  recommendation: CandidateRecommendation | null;
  citations: EvidenceCitation[];
  blocks: SafetyFinding[];
  warnings: SafetyFinding[];
  /** Attached for ranking/annotation only — never the basis of the decision. */
  supporting_evidence: SupportingEvidenceItem[];
  confidence: Confidence;
  rule_version: string;
  /** SHA-256 over deterministic content incl. engine provenance (excl. clock). */
  verdict_hash: string;
}

export interface DecideOptions {
  /** Engine/ML outputs offered as supporting evidence (never originate). */
  supporting?: SupportingEvidenceItem[];
}

export interface ClinicalDecisionModule<Q, C> {
  readonly domain: string;
  readonly version: string;
  /** Context fields required for a safe decision (drives missing-data). */
  requiredContext(query: Q): string[];
  decide(query: Q, context: C, opts?: DecideOptions): ClinicalVerdict;
}
