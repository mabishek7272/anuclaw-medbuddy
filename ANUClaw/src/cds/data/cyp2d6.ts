/**
 * CYP2D6 gene definition — activity-score method.
 *
 * ⚠ SEED DATA — NOT YET CLINICALLY VALIDATED.
 * Allele activity values and phenotype bands below follow the CPIC/DPWG 2019
 * activity-score consensus (Caudle et al., 2020) for illustration. They MUST be
 * reviewed and signed off by a pharmacogenomics SME under change control
 * (plan §4.1.3, §11.2) before any clinical use. This file is a change-controlled
 * artifact: after any edit, re-run `tsx scripts/cds-seal.ts` to update the
 * integrity manifest.
 *
 * Phenotype bands (activity score):
 *   Poor          : AS = 0
 *   Intermediate  : 0 < AS <= 1.0
 *   Normal        : 1.0 < AS <= 2.25
 *   Ultrarapid    : AS > 2.25
 */

import { GeneDefinition } from '../types';

export const cyp2d6: GeneDefinition = {
  data_id: 'cyp2d6',
  gene: 'CYP2D6',
  method: 'activity_score',
  version: '2024.1',
  source: 'CPIC CYP2D6 allele functionality table (seed; standardised AS consensus)',
  effective_date: '2024-01-01',
  notice:
    'SEED DATA — illustrative CYP2D6 activity values; requires SME validation and sign-off before clinical use.',
  alleles: {
    '*1': { function: 'normal', activity_value: 1.0 },
    '*2': { function: 'normal', activity_value: 1.0 },
    '*35': { function: 'normal', activity_value: 1.0 },
    '*9': { function: 'decreased', activity_value: 0.5 },
    '*17': { function: 'decreased', activity_value: 0.5 },
    '*29': { function: 'decreased', activity_value: 0.5 },
    '*10': { function: 'decreased', activity_value: 0.25 },
    '*41': { function: 'decreased', activity_value: 0.25 },
    '*3': { function: 'no_function', activity_value: 0.0 },
    '*4': { function: 'no_function', activity_value: 0.0 },
    '*5': { function: 'no_function', activity_value: 0.0 },
    '*6': { function: 'no_function', activity_value: 0.0 },
  },
  phenotype_thresholds: [
    {
      phenotype: 'Poor Metabolizer',
      min: 0,
      max: 0,
      min_inclusive: true,
      max_inclusive: true,
    },
    {
      phenotype: 'Intermediate Metabolizer',
      min: 0,
      max: 1.0,
      min_inclusive: false,
      max_inclusive: true,
    },
    {
      phenotype: 'Normal Metabolizer',
      min: 1.0,
      max: 2.25,
      min_inclusive: false,
      max_inclusive: true,
    },
    {
      phenotype: 'Ultrarapid Metabolizer',
      min: 2.25,
      max: null,
      min_inclusive: false,
      max_inclusive: false,
    },
  ],
};
