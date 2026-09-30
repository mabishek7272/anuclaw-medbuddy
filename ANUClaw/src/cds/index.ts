/**
 * ANUClaw v3 — Deterministic Decision Core (public surface).
 *
 * This is Phase 1 of the v3 CDS plan: genotype normalisation → deterministic
 * phenotype assignment → CPIC rule lookup, over versioned, integrity-verified
 * data files. It contains NO LLM and makes the clinical decision by pure table
 * lookup. Safety engines, evidence grounding, arbitration, the consistency
 * guard, FHIR I/O, and the (non-authoritative) LLM explanation layer are later
 * phases and are deliberately NOT part of this module.
 *
 * `evaluateDecisionCore` wires the three stages together for a single
 * gene-drug-diplotype query and returns a fully audit-reproducible result
 * (every output carries the data version + integrity hash that produced it).
 */

import { Phenotype, PhenotypeAssignment, RuleLookupResult } from './types';
import { normaliseDiplotype } from './genotype-normaliser';
import { assignPhenotype } from './phenotype-engine';
import { lookupRecommendation } from './rule-engine';
import { loadGene } from './registry';

export * from './types';
export { normaliseDiplotype, parseAllele } from './genotype-normaliser';
export { assignPhenotype } from './phenotype-engine';
export { lookupRecommendation, normaliseDrug, genesForDrug } from './rule-engine';
export {
  loadGene,
  loadRules,
  loadContraindications,
  loadInteractions,
  loadAllergyRules,
  loadCitations,
  assertIntegrity,
  computeIntegrity,
  resolveGeneId,
  CdsIntegrityError,
} from './registry';

// ── Evidence layer (§4.3) ──────────────────────────────────────────────────────
export * from './evidence/types';
export { groundEvidence } from './evidence/evidence-engine';
export type { GroundEvidenceInput } from './evidence/evidence-engine';

// ── Safety layer (Phase 2) ─────────────────────────────────────────────────────
export * from './safety/types';
export { assessCompleteness, checkMissingData } from './safety/missing-data';
export { checkContraindications } from './safety/contraindication';
export { checkInteractions } from './safety/interaction';
export { checkAllergies } from './safety/allergy';
export { arbitrate } from './safety/arbitrator';
export type { ArbitrationInput } from './safety/arbitrator';
export { runPipeline, runPipelineWithExplanation } from './pipeline';
export type {
  PipelineRequest,
  PipelineResult,
  AuditEvent,
  FullPipelineRequest,
  FullPipelineResult,
} from './pipeline';

// ── Explanation layer (§2.1, §3.1 stages 13–14, §4) ────────────────────────────
export * from './explanation/types';
export { generateExplanation } from './explanation/explanation-service';
export { checkConsistency } from './explanation/consistency-guard';
export {
  deterministicTemplateProvider,
  renderTemplate,
} from './explanation/template-provider';
export { buildExplanationPrompt } from './explanation/prompt';
export { expectedDirective } from './explanation/directive';

// ── FHIR + CDS Hooks ingress (§6) ──────────────────────────────────────────────
export * from './fhir/types';
export {
  buildSnapshot,
  prescribedMedications,
  normaliseConditionCode,
} from './fhir/snapshot-from-fhir';
export { verdictToCard } from './hooks/card-builder';
export type { CardContext } from './hooks/card-builder';
export {
  handleHook,
  evaluateRequest,
  cdsServiceDescriptor,
  SERVICE_ID,
} from './hooks/cds-hooks';
export type { HandleHookOptions, EvaluationItem } from './hooks/cds-hooks';
export { createCdsHooksRouter } from './hooks/router';

// ── Clinician review (§5.3) ────────────────────────────────────────────────────
export {
  evaluateForReview,
  submitSignOff,
  toReviewItem,
} from './review/review-service';
export type { ReviewItem, ReviewEvaluation } from './review/review-service';
export { renderReviewPage } from './review/page';
export type { ReviewPageOptions } from './review/page';
export { createClinicianReviewRouter } from './review/router';
export type { ReviewRouterOptions } from './review/router';
export { DEMO_REQUEST } from './review/demo-fixture';

// ── Security: SMART on FHIR / CDS Hooks auth (§6.5, WS-C5) ─────────────────────
export type { CdsAuthConfig, TokenClaims, Jwk, JwksFetch } from './security/types';
export {
  CdsAuthError,
  extractBearer,
  verifyBearerToken,
  verifyBearerTokenAsync,
  ASYMMETRIC_ALGS,
} from './security/verify';
export { JwksResolver, jwkToKeyObject } from './security/jwks';
export {
  grantedScopes,
  scopeSatisfies,
  hasRequiredScopes,
} from './security/scopes';

// ── Audit layer (§5.4) ─────────────────────────────────────────────────────────
export * from './audit/types';
export { AuditLog } from './audit/audit-log';
export type { RecordInput } from './audit/audit-log';
export { InMemoryAuditSink, FileAuditSink } from './audit/sinks';
export { GENESIS_HASH, computeEntryHash, verifyChain } from './audit/hash-chain';
export {
  runAuditedPipeline,
  runAuditedPipelineAsync,
  recordResult,
  resultRecordInputs,
  eventInputsFor,
} from './audit/audited-pipeline';
export type { AuditedPipelineResult } from './audit/audited-pipeline';
export { AsyncAuditLog } from './audit/async-audit-log';
export type { AsyncAuditSink } from './audit/async-audit-log';
export { PerTenantAuditLog } from './audit/per-tenant';
export type { SinkFactory } from './audit/per-tenant';
export { PostgresAuditSink } from './audit/postgres-sink';
export type { PgPoolLike, PgQueryResult } from './audit/postgres-sink';
export {
  PostgresPerTenantAuditLog,
  TenantScopedPgSink,
  ensureTenantAuditSchema,
} from './audit/postgres-tenant';
export {
  buildNextEntry,
  buildSignOffInput,
  RETENTION_YEARS,
} from './audit/entry-factory';

export type DecisionCoreResult =
  | {
      status: 'normalisation_failed';
      reason: string;
    }
  | {
      status: 'indeterminate';
      phenotype: PhenotypeAssignment;
    }
  | {
      status: 'decided';
      phenotype: PhenotypeAssignment;
      recommendation: RuleLookupResult;
    };

export interface DecisionCoreQuery {
  gene: string;
  /** Raw diplotype, e.g. '*1/*4'. */
  diplotype: string;
  /** Prescribed drug, e.g. 'codeine'. */
  drug: string;
}

/**
 * Run the deterministic decision core end to end for one query.
 * Pure with respect to the sealed data set; throws CdsIntegrityError (fail
 * closed) only if a data file fails its integrity check.
 */
export function evaluateDecisionCore(
  query: DecisionCoreQuery,
): DecisionCoreResult {
  const loaded = loadGene(query.gene); // throws CdsIntegrityError if unverified

  const norm = normaliseDiplotype(query.gene, query.diplotype);
  if (!norm.ok) {
    return { status: 'normalisation_failed', reason: norm.reason };
  }

  const phenotype = assignPhenotype(loaded, norm.diplotype);
  if (phenotype.indeterminate) {
    return { status: 'indeterminate', phenotype };
  }

  const recommendation = lookupRecommendation(
    query.gene,
    query.drug,
    phenotype.phenotype as Phenotype,
  );

  return { status: 'decided', phenotype, recommendation };
}
