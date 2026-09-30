/**
 * Pinned citation store (plan §4.3 "Version pinning", §5.2).
 *
 * ⚠ SEED DATA — NOT YET CLINICALLY VALIDATED. Statements are paraphrased
 * placeholders and PMIDs are illustrative; every entry must be replaced with the
 * exact guideline section text + resolvable PMIDs and SME-validated under change
 * control before clinical use. After any edit, re-run `tsx scripts/cds-seal.ts`.
 *
 * Each citation referenced by a CPIC rule (see `data/cpic-rules.ts`) MUST resolve
 * here, or the evidence engine blocks the recommendation (no-citation block).
 * CPIC guideline citations carry a `guideline_version` that must match the
 * rule's `cpic_version` (version pinning).
 */

import { CitationStore } from '../types';

export const citations: CitationStore = {
  data_id: 'citations',
  version: '2024.1',
  source: 'CPIC guideline sections + primary literature (seed)',
  notice:
    'SEED DATA — illustrative citation statements/PMIDs; requires SME validation before clinical use.',
  citations: {
    // ── Clopidogrel / CYP2C19 (CPIC 2022.1) ────────────────────────────────
    cpic_clopidogrel_2022: {
      id: 'cpic_clopidogrel_2022',
      source: 'CPIC',
      guideline: 'CPIC Guideline for Clopidogrel and CYP2C19',
      guideline_version: '2022.1',
      section: '4.2',
      strength: 'Strong',
      title: 'CPIC clopidogrel–CYP2C19 dosing recommendations',
      statement:
        'CYP2C19 poor and intermediate metabolizers have reduced clopidogrel active-metabolite formation; an alternative antiplatelet is recommended where appropriate.',
      supports: true,
    },
    pmid_placeholder_clopidogrel: {
      id: 'pmid_placeholder_clopidogrel',
      source: 'PubMed',
      pmid: '00000001',
      strength: null,
      title: 'Primary literature supporting CYP2C19–clopidogrel association',
      statement:
        'Loss-of-function CYP2C19 alleles are associated with reduced clopidogrel efficacy in patients undergoing PCI.',
      supports: true,
    },

    // ── Codeine / CYP2D6 (CPIC 2021.1) ─────────────────────────────────────
    cpic_codeine_2021: {
      id: 'cpic_codeine_2021',
      source: 'CPIC',
      guideline: 'CPIC Guideline for Codeine and CYP2D6',
      guideline_version: '2021.1',
      section: '3.1',
      strength: 'Strong',
      title: 'CPIC codeine–CYP2D6 therapy recommendations',
      statement:
        'CYP2D6 ultrarapid metabolizers risk morphine toxicity and poor metabolizers risk analgesic failure; avoid codeine in both.',
      supports: true,
    },
    pmid_placeholder_codeine: {
      id: 'pmid_placeholder_codeine',
      source: 'PubMed',
      pmid: '00000002',
      strength: null,
      title: 'Primary literature on CYP2D6 and codeine metabolism',
      statement:
        'CYP2D6 activity determines conversion of codeine to morphine, affecting both efficacy and toxicity.',
      supports: true,
    },

    // ── Escitalopram / CYP2C19 (CPIC 2015.1) ───────────────────────────────
    cpic_ssri_2015: {
      id: 'cpic_ssri_2015',
      source: 'CPIC',
      guideline: 'CPIC Guideline for SSRIs and CYP2C19/CYP2D6',
      guideline_version: '2015.1',
      section: '2.3',
      strength: 'Moderate',
      title: 'CPIC SSRI–CYP2C19 dosing recommendations',
      statement:
        'CYP2C19 poor metabolizers have higher escitalopram exposure; a reduced starting dose or alternative agent is suggested.',
      supports: true,
    },
    pmid_placeholder_ssri: {
      id: 'pmid_placeholder_ssri',
      source: 'PubMed',
      pmid: '00000003',
      strength: null,
      title: 'Primary literature on CYP2C19 and SSRI exposure',
      statement:
        'CYP2C19 metabolizer status influences plasma concentrations of CYP2C19-metabolised SSRIs.',
      supports: true,
    },
  },
};
