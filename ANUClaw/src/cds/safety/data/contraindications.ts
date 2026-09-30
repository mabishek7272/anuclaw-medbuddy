/**
 * Contraindication rule table (plan §7.1).
 *
 * ⚠ SEED DATA — NOT YET CLINICALLY VALIDATED. Illustrative rules to exercise the
 * contraindication engine; requires SME validation against drug labels and
 * clinical references under change control before clinical use. After any edit,
 * re-run `tsx scripts/cds-seal.ts`.
 *
 * Absolute contraindication -> hard BLOCK. Relative contraindication -> WARNING.
 * Matched by (drug, condition_code) against the patient's coded conditions.
 */

import { ContraindicationRule, SafetyRuleTable } from '../types';

export const contraindications: SafetyRuleTable<ContraindicationRule> = {
  data_id: 'contraindications',
  version: '2024.1',
  source: 'Drug-label contraindications (seed)',
  notice:
    'SEED DATA — illustrative contraindications; requires SME validation before clinical use.',
  rules: [
    {
      drug: 'clopidogrel',
      condition_code: 'active_pathological_bleeding',
      severity: 'absolute',
      action: 'block',
      rationale:
        'Clopidogrel is contraindicated in active pathological bleeding (e.g. peptic ulcer, intracranial haemorrhage).',
      citation_ids: ['label_clopidogrel_contra_bleeding'],
    },
    {
      drug: 'codeine',
      condition_code: 'severe_respiratory_depression',
      severity: 'absolute',
      action: 'block',
      rationale:
        'Codeine is contraindicated in patients with severe respiratory depression.',
      citation_ids: ['label_codeine_contra_resp'],
    },
    {
      drug: 'codeine',
      condition_code: 'pediatric_under_12',
      severity: 'absolute',
      action: 'block',
      rationale:
        'Codeine is contraindicated for analgesia in children under 12 years.',
      citation_ids: ['fda_codeine_pediatric'],
    },
    {
      drug: 'escitalopram',
      condition_code: 'congenital_long_qt_syndrome',
      severity: 'relative',
      action: 'warn',
      rationale:
        'Escitalopram prolongs QT; use with caution in congenital long-QT syndrome.',
      citation_ids: ['label_escitalopram_qt'],
    },
  ],
};
