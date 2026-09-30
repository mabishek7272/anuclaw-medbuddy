/**
 * Deterministic Phenotype Engine (plan §4.1).
 *
 * Converts a normalised diplotype into a metabolizer phenotype by pure table
 * lookup. CONTAINS NO MACHINE LEARNING. Referentially transparent: the same
 * diplotype always yields the same phenotype for a given, integrity-verified
 * gene-table version.
 *
 * Two methods are supported, matching how CPIC actually assigns phenotype:
 *   - activity_score      (e.g. CYP2D6): sum of per-allele activity values
 *                          (× copy number), then a threshold band.
 *   - diplotype_function  (e.g. CYP2C19): lookup on the sorted pair of allele
 *                          functional statuses.
 *
 * Any allele not present in the gene table, or a score that falls in no band,
 * returns 'Indeterminate' — never a guessed phenotype (plan §4.1.3).
 */

import {
  Diplotype,
  GeneDefinition,
  PhenotypeAssignment,
  PhenotypeThreshold,
} from './types';
import { LoadedGene } from './registry';

const INDETERMINATE = 'Indeterminate' as const;

function indeterminate(
  loaded: LoadedGene,
  diplotype: Diplotype,
  canonical: string,
  reason: string,
  activityScore: number | null,
): PhenotypeAssignment {
  return {
    gene: loaded.definition.gene,
    diplotype: canonical,
    phenotype: INDETERMINATE,
    activity_score: activityScore,
    method: loaded.definition.method,
    indeterminate: true,
    reason,
    rule_version: loaded.definition.version,
    table_hash: loaded.integrity,
  };
}

function bandContains(t: PhenotypeThreshold, score: number): boolean {
  const lowerOk = t.min_inclusive ? score >= t.min : score > t.min;
  const upperOk =
    t.max === null ? true : t.max_inclusive ? score <= t.max : score < t.max;
  return lowerOk && upperOk;
}

function canonicalString(diplotype: Diplotype): string {
  return `${diplotype.alleles[0].allele}/${diplotype.alleles[1].allele}`;
}

/**
 * Assign a phenotype to a normalised diplotype using a verified gene table.
 * Pure: no I/O, no randomness, no model.
 */
export function assignPhenotype(
  loaded: LoadedGene,
  diplotype: Diplotype,
): PhenotypeAssignment {
  const def: GeneDefinition = loaded.definition;
  const canonical = canonicalString(diplotype);

  if (diplotype.gene.toUpperCase() !== def.gene.toUpperCase()) {
    return indeterminate(
      loaded,
      diplotype,
      canonical,
      `Diplotype gene '${diplotype.gene}' does not match table gene '${def.gene}'`,
      null,
    );
  }

  const [a1, a2] = diplotype.alleles;
  const d1 = def.alleles[a1.core];
  const d2 = def.alleles[a2.core];

  // Any unannotated allele -> indeterminate (never guess).
  if (!d1 || !d2) {
    const unknowns = [!d1 ? a1.core : null, !d2 ? a2.core : null]
      .filter((x): x is string => x !== null)
      .join(', ');
    return indeterminate(
      loaded,
      diplotype,
      canonical,
      `Unannotated allele(s) for ${def.gene}: ${unknowns}`,
      null,
    );
  }

  if (def.method === 'activity_score') {
    if (
      d1.activity_value === undefined ||
      d2.activity_value === undefined ||
      !def.phenotype_thresholds
    ) {
      return indeterminate(
        loaded,
        diplotype,
        canonical,
        `Gene table '${def.data_id}' is missing activity values or thresholds`,
        null,
      );
    }

    // Copy number multiplies the allele's activity contribution.
    const score =
      d1.activity_value * a1.copies + d2.activity_value * a2.copies;

    const band = def.phenotype_thresholds.find((t) => bandContains(t, score));
    if (!band) {
      return indeterminate(
        loaded,
        diplotype,
        canonical,
        `Activity score ${score} falls in no defined phenotype band`,
        score,
      );
    }

    return {
      gene: def.gene,
      diplotype: canonical,
      phenotype: band.phenotype,
      activity_score: score,
      method: def.method,
      indeterminate: false,
      reason: null,
      rule_version: def.version,
      table_hash: loaded.integrity,
    };
  }

  // diplotype_function method
  if (!def.function_phenotype_map) {
    return indeterminate(
      loaded,
      diplotype,
      canonical,
      `Gene table '${def.data_id}' is missing a function_phenotype_map`,
      null,
    );
  }

  if (d1.function === 'unknown' || d2.function === 'unknown') {
    return indeterminate(
      loaded,
      diplotype,
      canonical,
      `Unknown allele function for ${def.gene}`,
      null,
    );
  }

  // Order-independent key: functions joined with '+' after sorting.
  const key = [d1.function, d2.function].sort().join('+');
  const phenotype = def.function_phenotype_map[key];
  if (!phenotype) {
    return indeterminate(
      loaded,
      diplotype,
      canonical,
      `No phenotype mapping for function pair '${key}'`,
      null,
    );
  }

  return {
    gene: def.gene,
    diplotype: canonical,
    phenotype,
    activity_score: null,
    method: def.method,
    indeterminate: false,
    reason: null,
    rule_version: def.version,
    table_hash: loaded.integrity,
  };
}
