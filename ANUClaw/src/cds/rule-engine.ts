/**
 * CPIC Rule Engine (plan §4.2).
 *
 * Takes a deterministic phenotype plus the prescribed drug and returns the
 * guideline recommendation by EXACT-MATCH lookup on (gene, drug, phenotype).
 * No fuzzy matching, no inference. If no rule exists for the triple, it returns
 * 'no_guideline_available' — it never extrapolates (plan §4.2.2).
 */

import { Phenotype, RuleLookupResult } from './types';
import { loadRules } from './registry';

/** Normalise a drug name for matching (trim + lower-case). */
export function normaliseDrug(drug: string): string {
  return drug.trim().toLowerCase();
}

/**
 * The pharmacogene(s) relevant to a drug, derived from the rule table so the
 * data stays the single source of truth. Empty ⇒ not a PGx drug we cover.
 */
export function genesForDrug(drug: string): string[] {
  const { table } = loadRules();
  const drugN = normaliseDrug(drug);
  const genes = new Set<string>();
  for (const r of table.rules) {
    if (r.drug === drugN) genes.add(r.gene.toUpperCase());
  }
  return [...genes];
}

/**
 * Look up the CPIC recommendation for a (gene, drug, phenotype) triple.
 * Returns the matching rule with the rule table's version + integrity hash, or
 * a 'no_guideline_available' result that still carries table provenance.
 */
export function lookupRecommendation(
  gene: string,
  drug: string,
  phenotype: Phenotype,
): RuleLookupResult {
  const { table, integrity } = loadRules();
  const geneU = gene.trim().toUpperCase();
  const drugN = normaliseDrug(drug);

  const match = table.rules.find(
    (r) =>
      r.gene.toUpperCase() === geneU &&
      r.drug === drugN &&
      r.phenotype === phenotype,
  );

  if (!match) {
    return {
      status: 'no_guideline_available',
      gene: geneU,
      drug: drugN,
      phenotype,
      table_version: table.version,
      table_hash: integrity,
    };
  }

  return {
    status: 'recommendation',
    rule: match,
    table_version: table.version,
    table_hash: integrity,
  };
}
