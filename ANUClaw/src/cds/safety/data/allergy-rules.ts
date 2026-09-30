/**
 * Allergy validation rule table (plan §7.3).
 *
 * ⚠ SEED DATA — NOT YET CLINICALLY VALIDATED. Illustrative drug-class and
 * cross-sensitivity mappings to exercise the allergy engine; requires SME
 * validation before clinical use. After any edit, re-run `tsx scripts/cds-seal.ts`.
 *
 * - A documented allergy to the drug (by name) or to its class -> BLOCK.
 * - A possible class cross-sensitivity -> WARNING.
 */

import { AllergyRuleTableData } from '../types';

export const allergyRules: AllergyRuleTableData = {
  data_id: 'allergy_rules',
  version: '2024.1',
  source: 'Drug class + cross-sensitivity mappings (seed)',
  notice:
    'SEED DATA — illustrative allergy/cross-sensitivity mappings; requires SME validation before clinical use.',
  drug_classes: {
    codeine: 'opioid',
    morphine: 'opioid',
    tramadol: 'opioid',
    clopidogrel: 'thienopyridine',
    prasugrel: 'thienopyridine',
    escitalopram: 'ssri',
    citalopram: 'ssri',
    sertraline: 'ssri',
    amoxicillin: 'penicillin',
    cefalexin: 'cephalosporin',
  },
  cross_sensitivity: {
    opioid: ['opioid'],
    thienopyridine: ['thienopyridine'],
    ssri: ['ssri'],
    // Penicillin allergy carries a recognised cross-reactivity to cephalosporins.
    penicillin: ['penicillin', 'cephalosporin'],
  },
};
