/**
 * Drug-drug interaction (DDI) rule table (plan §7.2).
 *
 * ⚠ SEED DATA — NOT YET CLINICALLY VALIDATED. Illustrative interactions to
 * exercise the DDI engine; requires SME validation against a maintained
 * interaction reference under change control before clinical use. After any
 * edit, re-run `tsx scripts/cds-seal.ts`.
 *
 * Matched order-independently on the (drug_a, drug_b) pair between the
 * prescribed drug and each active medication. contraindicated -> BLOCK;
 * major/moderate -> WARNING (major requires acknowledgement).
 */

import { InteractionRule, SafetyRuleTable } from '../types';

export const drugInteractions: SafetyRuleTable<InteractionRule> = {
  data_id: 'drug_interactions',
  version: '2024.1',
  source: 'Drug interaction reference (seed)',
  notice:
    'SEED DATA — illustrative drug interactions; requires SME validation before clinical use.',
  rules: [
    {
      drug_a: 'escitalopram',
      drug_b: 'phenelzine',
      severity: 'contraindicated',
      action: 'block',
      rationale:
        'SSRI + MAOI: risk of serotonin syndrome. Combination is contraindicated.',
      citation_ids: ['ddi_ssri_maoi'],
    },
    {
      drug_a: 'clopidogrel',
      drug_b: 'omeprazole',
      severity: 'major',
      action: 'warn',
      rationale:
        'Omeprazole (CYP2C19 inhibitor) reduces clopidogrel activation; consider an alternative acid suppressant (e.g. pantoprazole).',
      citation_ids: ['ddi_clopidogrel_omeprazole'],
    },
    {
      drug_a: 'codeine',
      drug_b: 'paroxetine',
      severity: 'major',
      action: 'warn',
      rationale:
        'Paroxetine (strong CYP2D6 inhibitor) reduces conversion of codeine to morphine, lowering analgesic efficacy.',
      citation_ids: ['ddi_codeine_cyp2d6_inhibitor'],
    },
    {
      drug_a: 'escitalopram',
      drug_b: 'tramadol',
      severity: 'major',
      action: 'warn',
      rationale:
        'Additive serotonergic effect: increased risk of serotonin syndrome; monitor closely.',
      citation_ids: ['ddi_ssri_tramadol'],
    },
  ],
};
