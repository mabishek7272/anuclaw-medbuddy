/**
 * CYP2C19 gene definition — diplotype-function method.
 *
 * ⚠ SEED DATA — NOT YET CLINICALLY VALIDATED.
 * CYP2C19 phenotype is assigned by the (order-independent) pair of allele
 * functional statuses rather than a continuous activity score, following the
 * CPIC CYP2C19 diplotype-to-phenotype approach. Values below are illustrative
 * and MUST be reviewed and signed off by a pharmacogenomics SME under change
 * control (plan §4.1.3, §11.2) before clinical use. After any edit, re-run
 * `tsx scripts/cds-seal.ts` to update the integrity manifest.
 *
 * `function_phenotype_map` is keyed by the two allele functions joined with '+'
 * after sorting alphabetically (decreased < increased < no_function < normal),
 * so the map is exhaustive over every function pair and order-independent.
 */

import { GeneDefinition } from '../types';

export const cyp2c19: GeneDefinition = {
  data_id: 'cyp2c19',
  gene: 'CYP2C19',
  method: 'diplotype_function',
  version: '2024.1',
  source: 'CPIC CYP2C19 diplotype-to-phenotype table (seed)',
  effective_date: '2024-01-01',
  notice:
    'SEED DATA — illustrative CYP2C19 allele functions; requires SME validation and sign-off before clinical use.',
  alleles: {
    '*1': { function: 'normal' },
    '*17': { function: 'increased' },
    '*9': { function: 'decreased' },
    '*10': { function: 'decreased' },
    '*2': { function: 'no_function' },
    '*3': { function: 'no_function' },
    '*4': { function: 'no_function' },
    '*5': { function: 'no_function' },
    '*6': { function: 'no_function' },
    '*7': { function: 'no_function' },
    '*8': { function: 'no_function' },
  },
  function_phenotype_map: {
    'decreased+decreased': 'Intermediate Metabolizer',
    'decreased+increased': 'Normal Metabolizer',
    'decreased+no_function': 'Intermediate Metabolizer',
    'decreased+normal': 'Intermediate Metabolizer',
    'increased+increased': 'Ultrarapid Metabolizer',
    'increased+no_function': 'Intermediate Metabolizer',
    'increased+normal': 'Rapid Metabolizer',
    'no_function+no_function': 'Poor Metabolizer',
    'no_function+normal': 'Intermediate Metabolizer',
    'normal+normal': 'Normal Metabolizer',
  },
};
