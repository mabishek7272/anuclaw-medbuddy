/**
 * Evidence-grounding types (plan §4.3).
 *
 * Every recommendation must be traceable to a source. The evidence engine
 * resolves each fired rule's citation IDs against a pinned, versioned citation
 * store and either grounds the recommendation, blocks it (no retrievable
 * citation), or flags a contradiction for human routing.
 */

import { RecommendationStrength } from '../types';

/** A single resolvable citation in the pinned store. */
export interface Citation {
  id: string;
  /** Origin, e.g. 'CPIC' or 'PubMed'. */
  source: string;
  guideline?: string;
  /** Guideline release this citation belongs to (used for version pinning). */
  guideline_version?: string;
  section?: string;
  /** CPIC evidence strength where applicable; `null` for primary literature. */
  strength?: RecommendationStrength | null;
  pmid?: string;
  title: string;
  statement: string;
  /** Whether this source supports the recommendation (false ⇒ contradicts). */
  supports: boolean;
}

export interface CitationStore {
  data_id: string;
  version: string;
  source: string;
  notice: string;
  citations: Record<string, Citation>;
}

/** One entry of the assembled evidence (plan §4.3.1 `evidence_used`). */
export interface EvidenceUsedItem {
  source: string;
  section?: string;
  strength?: RecommendationStrength;
  pmid?: string;
}

/** The evidence object attached to a verdict (plan §4.3.1). */
export interface EvidenceObject {
  recommendation_id: string;
  rules_triggered: string[];
  evidence_used: EvidenceUsedItem[];
  confidence_level: 'High' | 'Moderate' | 'Low';
  uncertainty: string;
}

export type EvidenceStatus = 'grounded' | 'blocked' | 'contradiction';

export interface EvidenceResult {
  status: EvidenceStatus;
  /** Human-readable detail of why a recommendation was grounded/blocked/flagged. */
  reason: string;
  evidence: EvidenceObject;
  /** Citation IDs that failed to resolve (drives the no-citation block). */
  missing_citation_ids: string[];
  table_version: string;
  table_hash: string;
}
