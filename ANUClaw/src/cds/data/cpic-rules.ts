/**
 * CPIC recommendation rule table — exact-match (gene, drug, phenotype).
 *
 * ⚠ SEED DATA — NOT YET CLINICALLY VALIDATED.
 * Recommendations below paraphrase published CPIC guidance for illustration of
 * the rule-engine mechanics. Every rule MUST be reviewed and signed off by a
 * pharmacogenomics SME against the cited guideline version under change control
 * (plan §4.2, §11.2) before clinical use. `citation_ids` are placeholders to be
 * replaced with resolvable guideline-section + PMID identifiers wired into the
 * evidence engine (plan §4.3). After any edit, re-run `tsx scripts/cds-seal.ts`.
 *
 * The engine performs EXACT-MATCH lookup only — no fuzzy matching, no
 * inference. A missing (gene, drug, phenotype) triple yields
 * 'no_guideline_available'; it is never extrapolated (plan §4.2.2).
 */

import { RuleTable } from '../types';

export const cpicRules: RuleTable = {
  data_id: 'cpic_rules',
  version: '2024.1',
  source: 'CPIC guideline summaries (seed)',
  notice:
    'SEED DATA — illustrative CPIC recommendations; requires SME validation against cited guideline versions before clinical use.',
  rules: [
    // ── CYP2C19 / clopidogrel ──────────────────────────────────────────────
    {
      gene: 'CYP2C19',
      drug: 'clopidogrel',
      phenotype: 'Poor Metabolizer',
      recommendation:
        'Avoid standard-dose clopidogrel. If no contraindication, use an alternative antiplatelet (e.g. prasugrel or ticagrelor) due to significantly reduced active-metabolite formation.',
      strength: 'Strong',
      cpic_version: '2022.1',
      citation_ids: ['cpic_clopidogrel_2022', 'pmid_placeholder_clopidogrel'],
      effective_date: '2022-01-01',
    },
    {
      gene: 'CYP2C19',
      drug: 'clopidogrel',
      phenotype: 'Intermediate Metabolizer',
      recommendation:
        'Avoid standard-dose clopidogrel where possible. If no contraindication, consider an alternative antiplatelet (e.g. prasugrel or ticagrelor).',
      strength: 'Moderate',
      cpic_version: '2022.1',
      citation_ids: ['cpic_clopidogrel_2022', 'pmid_placeholder_clopidogrel'],
      effective_date: '2022-01-01',
    },
    {
      gene: 'CYP2C19',
      drug: 'clopidogrel',
      phenotype: 'Normal Metabolizer',
      recommendation: 'Clopidogrel at standard label-recommended dose.',
      strength: 'Strong',
      cpic_version: '2022.1',
      citation_ids: ['cpic_clopidogrel_2022'],
      effective_date: '2022-01-01',
    },
    {
      gene: 'CYP2C19',
      drug: 'clopidogrel',
      phenotype: 'Rapid Metabolizer',
      recommendation: 'Clopidogrel at standard label-recommended dose.',
      strength: 'Strong',
      cpic_version: '2022.1',
      citation_ids: ['cpic_clopidogrel_2022'],
      effective_date: '2022-01-01',
    },
    {
      gene: 'CYP2C19',
      drug: 'clopidogrel',
      phenotype: 'Ultrarapid Metabolizer',
      recommendation: 'Clopidogrel at standard label-recommended dose.',
      strength: 'Strong',
      cpic_version: '2022.1',
      citation_ids: ['cpic_clopidogrel_2022'],
      effective_date: '2022-01-01',
    },

    // ── CYP2D6 / codeine ───────────────────────────────────────────────────
    {
      gene: 'CYP2D6',
      drug: 'codeine',
      phenotype: 'Ultrarapid Metabolizer',
      recommendation:
        'Avoid codeine due to risk of toxicity from increased morphine formation. Use a non-codeine, non-tramadol analgesic.',
      strength: 'Strong',
      cpic_version: '2021.1',
      citation_ids: ['cpic_codeine_2021', 'pmid_placeholder_codeine'],
      effective_date: '2021-01-01',
    },
    {
      gene: 'CYP2D6',
      drug: 'codeine',
      phenotype: 'Poor Metabolizer',
      recommendation:
        'Avoid codeine due to lack of efficacy (reduced morphine formation). Use an alternative analgesic that is not a CYP2D6 prodrug (avoid tramadol).',
      strength: 'Strong',
      cpic_version: '2021.1',
      citation_ids: ['cpic_codeine_2021', 'pmid_placeholder_codeine'],
      effective_date: '2021-01-01',
    },
    {
      gene: 'CYP2D6',
      drug: 'codeine',
      phenotype: 'Intermediate Metabolizer',
      recommendation:
        'Use codeine at label-recommended dose with monitoring. If no response, consider a non-tramadol alternative analgesic.',
      strength: 'Moderate',
      cpic_version: '2021.1',
      citation_ids: ['cpic_codeine_2021'],
      effective_date: '2021-01-01',
    },
    {
      gene: 'CYP2D6',
      drug: 'codeine',
      phenotype: 'Normal Metabolizer',
      recommendation: 'Use codeine at label-recommended dose.',
      strength: 'Strong',
      cpic_version: '2021.1',
      citation_ids: ['cpic_codeine_2021'],
      effective_date: '2021-01-01',
    },

    // ── CYP2C19 / escitalopram ─────────────────────────────────────────────
    {
      gene: 'CYP2C19',
      drug: 'escitalopram',
      phenotype: 'Poor Metabolizer',
      recommendation:
        'Reduce starting dose; consider a 50% reduction of the recommended starting dose and titrate to response, or select an alternative not predominantly metabolised by CYP2C19.',
      strength: 'Moderate',
      cpic_version: '2015.1',
      citation_ids: ['cpic_ssri_2015', 'pmid_placeholder_ssri'],
      effective_date: '2015-01-01',
    },
    {
      gene: 'CYP2C19',
      drug: 'escitalopram',
      phenotype: 'Ultrarapid Metabolizer',
      recommendation:
        'Consider an alternative antidepressant not predominantly metabolised by CYP2C19 due to risk of sub-therapeutic exposure.',
      strength: 'Optional',
      cpic_version: '2015.1',
      citation_ids: ['cpic_ssri_2015', 'pmid_placeholder_ssri'],
      effective_date: '2015-01-01',
    },
    {
      gene: 'CYP2C19',
      drug: 'escitalopram',
      phenotype: 'Normal Metabolizer',
      recommendation: 'Initiate escitalopram at standard label-recommended dose.',
      strength: 'Strong',
      cpic_version: '2015.1',
      citation_ids: ['cpic_ssri_2015'],
      effective_date: '2015-01-01',
    },
  ],
};
