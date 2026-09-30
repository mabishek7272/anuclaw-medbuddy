/**
 * ANUClaw v3 — Safety layer types (plan §5.1, §6.4, §7).
 *
 * The four safety engines (contraindication, interaction, allergy, missing-data)
 * are independent, deterministic, and fail-closed. Any one can BLOCK the
 * deterministic recommendation. The arbitrator reconciles them into one verdict
 * under the authority hierarchy (plan §2.2): safety BLOCK overrides everything.
 */

import { CpicRule, PhenotypeAssignment } from '../types';
import { EvidenceObject } from '../evidence/types';

// ── Patient snapshot (internal model, decoupled from FHIR — plan §6.4) ─────────

/**
 * A list that explicitly distinguishes "absent" from "confirmed none"
 * (plan §7.4). `unknown` means the field was never established → missing data.
 */
export interface KnownList<T> {
  status: 'provided' | 'confirmed_none' | 'unknown';
  items: T[];
}

export interface GenotypeRecord {
  gene: string;
  diplotype: string;
  source?: string;
  date?: string;
}

export interface Medication {
  name: string;
  dose?: string;
  route?: string;
}

export interface AllergyRecord {
  /** Substance name, e.g. 'codeine'. */
  substance: string;
  /** Optional explicit class, e.g. 'opioid'; inferred from tables if absent. */
  class?: string;
}

export interface ConditionRecord {
  /** Coded condition, e.g. 'active_pathological_bleeding'. */
  code: string;
  display?: string;
}

export interface PatientSnapshot {
  uid: string;
  prescribed_drug: Medication;
  genotypes: GenotypeRecord[];
  active_medications: KnownList<Medication>;
  allergies: KnownList<AllergyRecord>;
  conditions: KnownList<ConditionRecord>;
}

// ── Safety engine outputs ──────────────────────────────────────────────────────

export type SafetyEngineName =
  | 'missing_data'
  | 'contraindication'
  | 'interaction'
  | 'allergy';

export type SafetyStatus = 'pass' | 'warn' | 'block';

export interface SafetyFinding {
  engine: SafetyEngineName;
  /** Engine-specific severity label, e.g. 'absolute', 'major', 'documented'. */
  severity: string;
  action: 'block' | 'warn';
  message: string;
  citation_ids: string[];
}

export interface SafetyResult {
  engine: SafetyEngineName;
  status: SafetyStatus;
  findings: SafetyFinding[];
  /** Provenance of the rule table used (empty for engines without a table). */
  rule_version: string;
  table_hash: string;
}

// ── Generic sealed safety rule tables (plan Appendix A) ────────────────────────

export interface ContraindicationRule {
  drug: string;
  condition_code: string;
  severity: 'absolute' | 'relative';
  action: 'block' | 'warn';
  rationale: string;
  citation_ids: string[];
}

export interface InteractionRule {
  drug_a: string;
  drug_b: string;
  severity: 'contraindicated' | 'major' | 'moderate';
  action: 'block' | 'warn';
  rationale: string;
  citation_ids: string[];
}

export interface AllergyRuleTableData {
  data_id: string;
  version: string;
  source: string;
  notice: string;
  /** Drug (lower-case) → drug class. */
  drug_classes: Record<string, string>;
  /** Allergy class → classes that cross-react with it (possible sensitivity). */
  cross_sensitivity: Record<string, string[]>;
}

export interface SafetyRuleTable<T> {
  data_id: string;
  version: string;
  source: string;
  notice: string;
  rules: T[];
}

// ── Arbitrated verdict (plan §5.1) ─────────────────────────────────────────────

export type VerdictDecision =
  | 'recommend'
  | 'block'
  | 'cannot_advise'
  | 'no_guideline';

export type Confidence = 'high' | 'reduced' | 'none';

export interface Verdict {
  decision: VerdictDecision;
  /** Machine-readable reason, e.g. 'safety_block', 'missing_data'. */
  reason_code: string;
  recommendation: CpicRule | null;
  phenotype: PhenotypeAssignment | null;
  /** Grounding evidence for the recommendation, if one was evaluated. */
  evidence: EvidenceObject | null;
  blocks: SafetyFinding[];
  warnings: SafetyFinding[];
  confidence: Confidence;
  /** engine/table name → 'version:hash' provenance. */
  engine_versions: Record<string, string>;
  /** SHA-256 over the deterministic verdict content (excludes timestamp). */
  verdict_hash: string;
  /** ISO timestamp — audit only, deliberately excluded from verdict_hash. */
  timestamp: string;
  /** The arbitration.completed audit event (plan §3.1 stage 12, §5.1 step 8). */
  audit_event: ArbitrationAuditEvent;
}

export interface ArbitrationAuditEvent {
  type: 'arbitration.completed';
  decision: VerdictDecision;
  reason_code: string;
  verdict_hash: string;
  engine_versions: Record<string, string>;
  timestamp: string;
}
