/**
 * Oncology combination — seed clinical content (Phase 0, WS-E).
 *
 * ⚠ SEED / ILLUSTRATIVE — NOT CLINICALLY VALIDATED. Regimen‑indication rules,
 * guideline citations, and organ‑function thresholds below are placeholders to
 * exercise the decision path. They require oncology SME validation against the
 * cited guideline versions and the four per‑domain validation gates before any
 * clinical use (see ELAB_Gate_Specs_Oncology.md). Validation‑environment only.
 *
 * The regimen‑indication table is the ONLY thing that may ORIGINATE a
 * recommendation (INV‑ORIG). It is deterministic, criteria‑match (no inference).
 */

import { EvidenceCitation } from '../types';

export const ONCOLOGY_RULES_VERSION = 'seed-2026.1';

export interface RegimenRule {
  tumor_type: string;
  stage: string;
  biomarker: string;
  line: number;
  /** Canonical regimen (set‑compared, order‑independent). */
  regimen: string[];
  recommendation: string;
  strength: 'Strong' | 'Moderate' | 'Optional';
  citation_ids: string[];
}

export const regimenRules: RegimenRule[] = [
  {
    tumor_type: 'breast',
    stage: 'II',
    biomarker: 'HER2+',
    line: 1,
    regimen: ['trastuzumab', 'pertuzumab', 'docetaxel'],
    recommendation:
      'HER2‑targeted dual blockade with taxane (trastuzumab + pertuzumab + docetaxel) is a guideline‑recommended first‑line option for HER2+ stage II breast cancer, subject to cardiac eligibility.',
    strength: 'Strong',
    citation_ids: ['nccn_breast_her2_2025'],
  },
  {
    tumor_type: 'colorectal',
    stage: 'III',
    biomarker: 'pan-RAS-wt',
    line: 1,
    regimen: ['oxaliplatin', 'fluorouracil', 'leucovorin'],
    recommendation:
      'FOLFOX (oxaliplatin + fluorouracil + leucovorin) is a guideline‑recommended adjuvant regimen for stage III colorectal cancer.',
    strength: 'Strong',
    citation_ids: ['nccn_crc_adjuvant_2025'],
  },
];

export const guidelineCitations: Record<string, EvidenceCitation> = {
  nccn_breast_her2_2025: {
    id: 'nccn_breast_her2_2025',
    source: 'NCCN',
    section: 'Breast Cancer · BINV‑L (HER2+)',
    statement:
      'Dual HER2 blockade with a taxane is recommended in the first‑line setting for HER2‑positive disease; assess LVEF before and during therapy.',
  },
  nccn_crc_adjuvant_2025: {
    id: 'nccn_crc_adjuvant_2025',
    source: 'NCCN',
    section: 'Colon Cancer · COL‑D (adjuvant)',
    statement: 'Oxaliplatin‑based adjuvant chemotherapy is recommended for stage III colon cancer.',
  },
};

/** Deterministic organ‑function eligibility (a contraindication originator). */
export interface OrganRule {
  drug: string;
  metric: 'lvef' | 'renal_egfr' | 'hepatic_child_pugh_score';
  /** Inclusive minimum required value. */
  min?: number;
  rationale: string;
  citation_ids: string[];
}

export const organRules: OrganRule[] = [
  {
    drug: 'trastuzumab',
    metric: 'lvef',
    min: 50,
    rationale: 'Trastuzumab carries cardiotoxicity risk; LVEF below 50% is a contraindication.',
    citation_ids: ['nccn_breast_her2_2025'],
  },
];
