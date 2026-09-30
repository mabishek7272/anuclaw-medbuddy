/**
 * Safety Arbitrator (plan §5.1) — the final automated gate.
 *
 * Collects the deterministic recommendation and every safety-engine result and
 * produces ONE verdict under the authority hierarchy (plan §2.2). Safety always
 * wins: any single BLOCK forces decision = 'block', regardless of the
 * recommendation. Warnings annotate the verdict and lower confidence.
 *
 * Precedence (highest first):
 *   1. Missing data            -> 'cannot_advise' (cannot trust inputs; §3.2)
 *   2. Any safety BLOCK        -> 'block' (a definite "must not administer")
 *   3. Indeterminate phenotype -> 'cannot_advise' (route to pharmacist; §3.3)
 *   4. No guideline for triple -> 'no_guideline'
 *   5. Evidence not grounded   -> 'cannot_advise' (no-citation block / pinning; §4.3)
 *   6. Evidence contradiction  -> 'cannot_advise' (route to human; §4.3)
 *   7. Otherwise               -> 'recommend' (+ warnings, reduced confidence)
 *
 * The verdict is referentially transparent: `verdict_hash` is computed over the
 * deterministic content only, deliberately excluding the audit timestamp, so a
 * verdict can be reproduced from the audit log (plan §5.4).
 */

import { contentHash } from '../hashing';
import { CpicRule, PhenotypeAssignment, RuleLookupResult } from '../types';
import { EvidenceResult } from '../evidence/types';
import {
  ArbitrationAuditEvent,
  Confidence,
  SafetyFinding,
  SafetyResult,
  Verdict,
  VerdictDecision,
} from './types';

export interface ArbitrationInput {
  /** Phenotype assignment from the decision core, or null if unavailable. */
  phenotype: PhenotypeAssignment | null;
  /** Rule lookup result, or null if the phenotype was indeterminate. */
  recommendation: RuleLookupResult | null;
  /** Evidence grounding for the recommendation, or null if none was evaluated. */
  evidence?: EvidenceResult | null;
  /** Results of all four safety engines. */
  safety: SafetyResult[];
  /** Injectable clock for deterministic testing; defaults to wall clock. */
  now?: () => Date;
}

function collectFindings(
  safety: SafetyResult[],
  action: 'block' | 'warn',
): SafetyFinding[] {
  return safety.flatMap((r) => r.findings.filter((f) => f.action === action));
}

function engineVersions(input: ArbitrationInput): Record<string, string> {
  const versions: Record<string, string> = {};
  for (const r of input.safety) {
    if (r.rule_version || r.table_hash) {
      versions[r.engine] = `${r.rule_version}:${r.table_hash}`;
    }
  }
  if (input.phenotype) {
    versions['phenotype'] = `${input.phenotype.rule_version}:${input.phenotype.table_hash}`;
  }
  if (input.recommendation) {
    versions['rules'] = `${input.recommendation.table_version}:${input.recommendation.table_hash}`;
  }
  if (input.evidence) {
    versions['evidence'] = `${input.evidence.table_version}:${input.evidence.table_hash}`;
  }
  return versions;
}

export function arbitrate(input: ArbitrationInput): Verdict {
  const now = input.now ?? (() => new Date());
  const blocks = collectFindings(input.safety, 'block');
  const warnings = collectFindings(input.safety, 'warn');
  const versions = engineVersions(input);

  const missingData = input.safety.find((r) => r.engine === 'missing_data');

  let decision: VerdictDecision;
  let reason_code: string;
  let recommendation: CpicRule | null = null;

  if (missingData && missingData.status === 'block') {
    // (1) Missing data — cannot trust any downstream result.
    decision = 'cannot_advise';
    reason_code = 'missing_data';
  } else if (blocks.length > 0) {
    // (2) Safety BLOCK — a definite "must not administer" — overrides all else.
    decision = 'block';
    reason_code = 'safety_block';
  } else if (!input.phenotype || input.phenotype.indeterminate) {
    // (3) Indeterminate / absent phenotype — route to pharmacist.
    decision = 'cannot_advise';
    reason_code = 'indeterminate_phenotype';
  } else if (
    !input.recommendation ||
    input.recommendation.status === 'no_guideline_available'
  ) {
    // (4) Phenotype known but no guideline for this triple.
    decision = 'no_guideline';
    reason_code = 'no_guideline_available';
  } else if (input.evidence && input.evidence.status === 'blocked') {
    // (5) Recommendation cannot be grounded — fail closed (plan §4.3, §3.3).
    decision = 'cannot_advise';
    reason_code = 'evidence_unavailable';
  } else if (input.evidence && input.evidence.status === 'contradiction') {
    // (6) Sources disagree — route to human (plan §4.3).
    decision = 'cannot_advise';
    reason_code = 'evidence_contradiction';
  } else {
    // (7) Safe, grounded recommendation (possibly with warnings).
    decision = 'recommend';
    reason_code = warnings.length > 0 ? 'recommend_with_warnings' : 'recommend';
    recommendation = input.recommendation.rule;
  }

  const confidence: Confidence =
    decision === 'recommend'
      ? warnings.length > 0
        ? 'reduced'
        : 'high'
      : 'none';

  // Only attach the evidence object when a recommendation was actually grounded.
  const evidence =
    decision === 'recommend' && input.evidence ? input.evidence.evidence : null;

  // Deterministic content for the verdict hash — NO timestamp.
  const hashContent = {
    decision,
    reason_code,
    recommendation,
    phenotype: input.phenotype
      ? {
          diplotype: input.phenotype.diplotype,
          phenotype: input.phenotype.phenotype,
          table_hash: input.phenotype.table_hash,
        }
      : null,
    evidence: input.evidence
      ? {
          status: input.evidence.status,
          rules_triggered: input.evidence.evidence.rules_triggered,
          missing: input.evidence.missing_citation_ids,
          confidence: input.evidence.evidence.confidence_level,
        }
      : null,
    blocks,
    warnings,
    engine_versions: versions,
  };
  const verdict_hash = contentHash(hashContent);
  const timestamp = now().toISOString();

  const audit_event: ArbitrationAuditEvent = {
    type: 'arbitration.completed',
    decision,
    reason_code,
    verdict_hash,
    engine_versions: versions,
    timestamp,
  };

  return {
    decision,
    reason_code,
    recommendation,
    phenotype: input.phenotype,
    evidence,
    blocks,
    warnings,
    confidence,
    engine_versions: versions,
    verdict_hash,
    timestamp,
    audit_event,
  };
}
