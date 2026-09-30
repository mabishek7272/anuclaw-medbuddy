/**
 * CDS pipeline composition — master pipeline stages 4–12 (plan §3.1).
 *
 * Wires the deterministic decision core (Phase 1) to the four safety engines
 * and the arbitrator (Phase 2): completeness → phenotype → rule → safety checks
 * → arbitration. Every stage contributes an audit event (plan §3.1 "Each step
 * writes to the audit log"); here they are returned for the (future) audit
 * service rather than persisted.
 *
 * Fail-closed: incomplete data short-circuits before the decision core runs
 * (plan §3.2 invariant). Pure with respect to the sealed data set; throws only
 * CdsIntegrityError if a data file fails verification.
 */

import { normaliseDiplotype } from './genotype-normaliser';
import { assignPhenotype } from './phenotype-engine';
import { lookupRecommendation } from './rule-engine';
import { loadGene } from './registry';
import { Phenotype, PhenotypeAssignment, RuleLookupResult } from './types';
import { checkMissingData } from './safety/missing-data';
import { checkContraindications } from './safety/contraindication';
import { checkInteractions } from './safety/interaction';
import { checkAllergies } from './safety/allergy';
import { arbitrate } from './safety/arbitrator';
import { groundEvidence } from './evidence/evidence-engine';
import { EvidenceResult } from './evidence/types';
import { PatientSnapshot, SafetyResult, Verdict } from './safety/types';
import { generateExplanation } from './explanation/explanation-service';
import {
  ExplanationProvider,
  ExplanationResult,
} from './explanation/types';

export interface PipelineRequest {
  snapshot: PatientSnapshot;
  /** The pharmacogene to evaluate for the prescribed drug, e.g. 'CYP2D6'. */
  gene: string;
  /** Injectable clock for deterministic testing. */
  now?: () => Date;
}

export interface AuditEvent {
  stage: string;
  event: string;
  status: string;
}

export interface PipelineResult {
  verdict: Verdict;
  /** Ordered audit trail of the stages that ran (plan §3.1). */
  trace: AuditEvent[];
}

export function runPipeline(req: PipelineRequest): PipelineResult {
  const { snapshot, gene } = req;
  const drug = snapshot.prescribed_drug?.name ?? '';
  const trace: AuditEvent[] = [];

  // Stage 4 — completeness check (gate: incomplete data short-circuits).
  const missingData = checkMissingData(snapshot, gene);
  trace.push({
    stage: '4',
    event: 'completeness.checked',
    status: missingData.status,
  });

  if (missingData.status === 'block') {
    const verdict = arbitrate({
      phenotype: null,
      recommendation: null,
      safety: [missingData],
      now: req.now,
    });
    trace.push({
      stage: '12',
      event: 'arbitration.completed',
      status: verdict.decision,
    });
    return { verdict, trace };
  }

  // Stages 5–6 — genotype normalisation + deterministic phenotype.
  const loaded = loadGene(gene);
  const genotypeRecord = snapshot.genotypes.find(
    (g) => g.gene.trim().toUpperCase() === gene.trim().toUpperCase(),
  );

  let phenotype: PhenotypeAssignment | null = null;
  let recommendation: RuleLookupResult | null = null;
  let evidence: EvidenceResult | null = null;

  const norm = genotypeRecord
    ? normaliseDiplotype(gene, genotypeRecord.diplotype)
    : { ok: false as const, reason: 'no genotype for gene' };

  if (norm.ok) {
    phenotype = assignPhenotype(loaded, norm.diplotype);
    trace.push({
      stage: '6',
      event: 'phenotype.assigned',
      status: phenotype.indeterminate ? 'indeterminate' : phenotype.phenotype,
    });

    // Stage 7 — rule evaluation (only for a determinate phenotype).
    if (!phenotype.indeterminate) {
      recommendation = lookupRecommendation(
        gene,
        drug,
        phenotype.phenotype as Phenotype,
      );
      trace.push({
        stage: '7',
        event: 'rule.evaluated',
        status: recommendation.status,
      });

      // Stage 8 — evidence retrieval (only when a rule actually fired).
      if (recommendation.status === 'recommendation') {
        evidence = groundEvidence({
          recommendation_id: `${phenotype.diplotype}:${drug}`,
          rule: recommendation.rule,
        });
        trace.push({
          stage: '8',
          event: 'evidence.retrieved',
          status: evidence.status,
        });
      }
    }
  } else {
    trace.push({
      stage: '6',
      event: 'phenotype.assigned',
      status: 'normalisation_failed',
    });
  }

  // Stages 9–11 — independent safety checks.
  const safety: SafetyResult[] = [
    missingData,
    checkContraindications(snapshot),
    checkInteractions(snapshot),
    checkAllergies(snapshot),
  ];
  for (const r of safety) {
    if (r.engine === 'missing_data') continue;
    trace.push({ stage: '9-11', event: `${r.engine}.checked`, status: r.status });
  }

  // Stage 12 — safety arbitration.
  const verdict = arbitrate({
    phenotype,
    recommendation,
    evidence,
    safety,
    now: req.now,
  });
  trace.push({
    stage: '12',
    event: 'arbitration.completed',
    status: verdict.decision,
  });

  return { verdict, trace };
}

export interface FullPipelineRequest extends PipelineRequest {
  /** Optional injected narrator; defaults to the deterministic template. */
  explanationProvider?: ExplanationProvider;
  /** Max explanation attempts before escalation (default 3). */
  maxExplanationAttempts?: number;
}

export interface FullPipelineResult extends PipelineResult {
  explanation: ExplanationResult;
}

/**
 * Master pipeline stages 4–14: runs the deterministic + safety pipeline, then
 * the explanation layer + consistency guard (stages 13–14). Async because an
 * injected LLM narrator may be async; with the default deterministic narrator
 * it resolves immediately.
 */
export async function runPipelineWithExplanation(
  req: FullPipelineRequest,
): Promise<FullPipelineResult> {
  const { verdict, trace } = runPipeline(req);

  const explanation = await generateExplanation(
    verdict,
    { gene: req.gene, drug: req.snapshot.prescribed_drug?.name ?? '' },
    {
      provider: req.explanationProvider,
      maxAttempts: req.maxExplanationAttempts,
    },
  );

  trace.push({
    stage: '13',
    event: 'explanation.generated',
    status: explanation.status,
  });
  trace.push({
    stage: '14',
    event: 'consistency.verified',
    status: explanation.consistency.consistent ? 'pass' : 'fail',
  });

  return { verdict, trace, explanation };
}
