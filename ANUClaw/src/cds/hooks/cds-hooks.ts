/**
 * CDS Hooks service (plan §6.3).
 *
 * Framework-agnostic: `handleHook` takes a CDS Hooks request and returns the
 * response cards, so it can be mounted on Express (see `router.ts`) or called
 * directly in tests. For every prescribed PGx drug it runs the full master
 * pipeline (stages 4–14) per relevant gene and emits one card.
 *
 * The LLM narrator remains injected and non-authoritative; with no provider the
 * deterministic template is used.
 */

import { AuditEvent, runPipelineWithExplanation } from '../pipeline';
import { genesForDrug } from '../rule-engine';
import { ExplanationProvider, ExplanationResult } from '../explanation/types';
import { Verdict } from '../safety/types';
import { AuditLog } from '../audit/audit-log';
import { recordResult } from '../audit/audited-pipeline';
import {
  buildSnapshot,
  prescribedMedications,
} from '../fhir/snapshot-from-fhir';
import {
  CdsCard,
  CdsHookRequest,
  CdsResponse,
  CdsServiceDescriptor,
} from '../fhir/types';
import { verdictToCard } from './card-builder';

export const SERVICE_ID = 'anuclaw-pgx-dosing';

const SUPPORTED_HOOKS = new Set(['order-sign', 'order-select']);

/** Discovery descriptor for `GET /cds-services` (plan §6.3). */
export function cdsServiceDescriptor(): CdsServiceDescriptor {
  return {
    hook: 'order-sign',
    id: SERVICE_ID,
    title: 'ANUClaw v3 — Pharmacogenomic Dosing Support (CYP2D6/CYP2C19)',
    description:
      'Deterministic, CPIC-grounded pharmacogenomic dosing guidance with mandatory clinician review.',
    prefetch: {
      genotypes:
        'Observation?patient={{context.patientId}}&category=laboratory',
      medications: 'MedicationStatement?patient={{context.patientId}}',
      allergies: 'AllergyIntolerance?patient={{context.patientId}}',
      conditions: 'Condition?patient={{context.patientId}}',
    },
  };
}

export interface HandleHookOptions {
  explanationProvider?: ExplanationProvider;
  maxExplanationAttempts?: number;
  now?: () => Date;
  /**
   * Optional hash-chained audit log. When provided, each verdict is recorded
   * BEFORE its card is emitted; an audit-write failure halts (no card),
   * enforcing "no clinical output without an audit record" (plan §3.2).
   */
  auditLog?: AuditLog;
}

/** One evaluated (drug, gene) result — shared by the hook + review surfaces. */
export interface EvaluationItem {
  gene: string;
  drug: string;
  verdict: Verdict;
  explanation: ExplanationResult;
  /** Stage trace for audit recording. */
  trace: AuditEvent[];
  card: CdsCard;
}

/**
 * Evaluate every prescribed PGx drug × relevant gene and return rich items.
 * Records to the audit log (if provided) BEFORE producing the card, so an audit
 * failure halts before any clinical output (plan §3.2).
 */
export async function evaluateRequest(
  request: CdsHookRequest,
  options: HandleHookOptions = {},
): Promise<EvaluationItem[]> {
  const items: EvaluationItem[] = [];

  for (const drug of prescribedMedications(request)) {
    const genes = genesForDrug(drug.name);
    if (genes.length === 0) continue; // not a PGx drug we cover → say nothing

    const snapshot = buildSnapshot(request, drug);

    for (const gene of genes) {
      const result = await runPipelineWithExplanation({
        snapshot,
        gene,
        explanationProvider: options.explanationProvider,
        maxExplanationAttempts: options.maxExplanationAttempts,
        now: options.now,
      });
      if (options.auditLog) {
        recordResult(options.auditLog, result, gene, snapshot.uid);
      }
      items.push({
        gene,
        drug: drug.name,
        verdict: result.verdict,
        explanation: result.explanation,
        trace: result.trace,
        card: verdictToCard(result.verdict, result.explanation, { gene, drug: drug.name }),
      });
    }
  }

  return items;
}

export async function handleHook(
  request: CdsHookRequest,
  options: HandleHookOptions = {},
): Promise<CdsResponse> {
  if (!SUPPORTED_HOOKS.has(request.hook)) {
    return { cards: [] };
  }
  const items = await evaluateRequest(request, options);
  return { cards: items.map((i) => i.card) };
}
