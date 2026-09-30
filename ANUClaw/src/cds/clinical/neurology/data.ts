/**
 * Neurology — antiseizure medication (ASM) seed clinical content (Phase 0, WS-E).
 *
 * ⚠ SEED / ILLUSTRATIVE — NOT CLINICALLY VALIDATED. The indication→regimen rules,
 * guideline citations, and contraindication thresholds below are placeholders to
 * exercise the deterministic decision path for a SECOND clinical domain. They
 * require neurology SME validation against the cited guideline versions and the
 * four per-domain validation gates before any clinical use. Validation-only.
 *
 * Same shape as oncology: a deterministic indication-match table ORIGINATES the
 * recommendation (INV-ORIG); deterministic factor/organ rules ORIGINATE blocks.
 */

import { EvidenceCitation } from '../types';

export const NEUROLOGY_RULES_VERSION = 'seed-2026.1';

export interface AsmRule {
  indication: string;
  line: number;
  /** Canonical regimen (set-compared, order-independent). */
  regimen: string[];
  recommendation: string;
  strength: 'Strong' | 'Moderate' | 'Optional';
  citation_ids: string[];
}

export const asmRules: AsmRule[] = [
  {
    indication: 'focal-onset seizures',
    line: 1,
    regimen: ['lamotrigine'],
    recommendation:
      'Lamotrigine is a guideline-recommended first-line monotherapy for focal-onset seizures (titrate slowly to reduce rash risk).',
    strength: 'Strong',
    citation_ids: ['nice_ng217_focal'],
  },
  {
    indication: 'focal-onset seizures',
    line: 1,
    regimen: ['levetiracetam'],
    recommendation:
      'Levetiracetam is a guideline-recommended first-line monotherapy option for focal-onset seizures.',
    strength: 'Strong',
    citation_ids: ['nice_ng217_focal'],
  },
  {
    indication: 'generalized tonic-clonic seizures',
    line: 1,
    regimen: ['lamotrigine'],
    recommendation:
      'Lamotrigine is a recommended first-line option for generalized tonic-clonic seizures, particularly where valproate is unsuitable.',
    strength: 'Moderate',
    citation_ids: ['nice_ng217_gtc'],
  },
  {
    indication: 'generalized tonic-clonic seizures',
    line: 1,
    regimen: ['valproate'],
    recommendation:
      'Sodium valproate is highly effective first-line for generalized tonic-clonic seizures, but is contraindicated in pregnancy and in people able to become pregnant unless strict conditions are met.',
    strength: 'Strong',
    citation_ids: ['nice_ng217_gtc', 'mhra_valproate'],
  },
];

export const guidelineCitations: Record<string, EvidenceCitation> = {
  nice_ng217_focal: {
    id: 'nice_ng217_focal',
    source: 'NICE',
    section: 'NG217 · Epilepsies (focal onset)',
    statement: 'Offer lamotrigine or levetiracetam as first-line monotherapy for focal-onset seizures.',
  },
  nice_ng217_gtc: {
    id: 'nice_ng217_gtc',
    source: 'NICE',
    section: 'NG217 · Epilepsies (generalized tonic-clonic)',
    statement: 'Offer sodium valproate first-line for generalized tonic-clonic seizures except in those able to become pregnant; otherwise offer lamotrigine or levetiracetam.',
  },
  mhra_valproate: {
    id: 'mhra_valproate',
    source: 'MHRA',
    section: 'Valproate Pregnancy Prevention Programme',
    statement: 'Valproate must not be used in pregnancy or in women/people of childbearing potential unless the conditions of the pregnancy prevention programme are met.',
  },
  fda_hla_b1502: {
    id: 'fda_hla_b1502',
    source: 'FDA',
    section: 'Carbamazepine label · HLA-B*15:02',
    statement: 'Patients positive for HLA-B*15:02 are at high risk of Stevens-Johnson syndrome / toxic epidermal necrolysis with carbamazepine; avoid unless benefit clearly outweighs risk.',
  },
};

/** Deterministic factor/organ contraindications (a block originator). */
export interface SafetyRule {
  drug: string;
  /** Patient factor or organ metric this rule inspects. */
  factor: 'pregnancy_status' | 'hla_b_1502' | 'renal_egfr';
  /** Factor values that trigger the rule (for categorical factors). */
  triggers?: string[];
  /** Inclusive minimum (for numeric organ metrics) below which it triggers. */
  min?: number;
  action: 'block' | 'warn';
  severity: 'absolute' | 'relative' | 'caution';
  rationale: string;
  citation_ids: string[];
}

export const safetyRules: SafetyRule[] = [
  {
    drug: 'valproate',
    factor: 'pregnancy_status',
    triggers: ['pregnant', 'childbearing_potential'],
    action: 'block',
    severity: 'absolute',
    rationale: 'Valproate is teratogenic and associated with neurodevelopmental harm; contraindicated in pregnancy and in those of childbearing potential unless pregnancy-prevention conditions are met.',
    citation_ids: ['mhra_valproate'],
  },
  {
    drug: 'carbamazepine',
    factor: 'hla_b_1502',
    triggers: ['positive'],
    action: 'block',
    severity: 'absolute',
    rationale: 'HLA-B*15:02 positivity confers high risk of SJS/TEN with carbamazepine.',
    citation_ids: ['fda_hla_b1502'],
  },
  {
    drug: 'levetiracetam',
    factor: 'renal_egfr',
    min: 30,
    action: 'warn',
    severity: 'caution',
    rationale: 'Levetiracetam is renally cleared; dose reduction is required when eGFR is below 30 mL/min/1.73m².',
    citation_ids: ['nice_ng217_focal'],
  },
];
