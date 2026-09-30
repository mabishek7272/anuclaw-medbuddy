/**
 * Genotype normaliser — star-allele standardisation (plan §3.1 stage 5).
 *
 * Converts a raw diplotype string into a canonical, order-independent
 * `Diplotype`. It does NOT decide phenotype and it never guesses: an
 * unparseable input returns `{ ok: false }`, and downstream the phenotype
 * engine returns 'Indeterminate' for any allele not present in the gene table
 * (plan §4.1.3 "Novel or unannotated alleles return 'indeterminate'").
 *
 * Copy-number duplications are parsed as `*NxM` (e.g. '*1x2'); the phenotype
 * engine multiplies the allele's activity value by the copy number, which is
 * what lets a duplication of a functional allele reach the Ultrarapid band.
 */

import { Diplotype, NormaliseResult, ParsedAllele } from './types';

/** Parse a single allele token into its canonical form, or `null` if invalid. */
export function parseAllele(token: string): ParsedAllele | null {
  let t = token.trim();
  if (!t) return null;

  // Accept a bare number ('1') as a star-allele ('*1') for convenience.
  if (!t.startsWith('*')) {
    if (/^\d/.test(t)) t = `*${t}`;
    else return null;
  }

  // *<core>[x<copies>]  e.g. *4, *1x2, *41
  const m = t.match(/^\*(\d+[A-Za-z]*)(?:[x×](\d+))?$/);
  if (!m) return null;

  const core = `*${m[1]}`;
  const copies = m[2] ? parseInt(m[2], 10) : 1;
  if (copies < 1) return null;

  return {
    allele: copies > 1 ? `${core}x${copies}` : core,
    core,
    copies,
  };
}

/** Stable ordering: by core allele number, then suffix, then copy number. */
function compareAlleles(a: ParsedAllele, b: ParsedAllele): number {
  const na = parseInt(a.core.slice(1), 10);
  const nb = parseInt(b.core.slice(1), 10);
  if (na !== nb) return na - nb;
  if (a.core !== b.core) return a.core < b.core ? -1 : 1;
  return a.copies - b.copies;
}

/**
 * Normalise a raw diplotype (e.g. '*1/*4', '*4/*1', '1/4', '*1x2/*1') into a
 * canonical, sorted `Diplotype`. Returns `{ ok: false, reason }` for anything
 * that is not exactly two parseable alleles.
 */
export function normaliseDiplotype(gene: string, raw: string): NormaliseResult {
  const parts = raw
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (parts.length !== 2) {
    return {
      ok: false,
      reason: `Expected two alleles separated by '/', got: '${raw}'`,
    };
  }

  const a = parseAllele(parts[0]);
  const b = parseAllele(parts[1]);
  if (!a || !b) {
    return { ok: false, reason: `Unparseable allele in diplotype '${raw}'` };
  }

  const [first, second] = compareAlleles(a, b) <= 0 ? [a, b] : [b, a];
  const diplotype: Diplotype = {
    gene: gene.trim().toUpperCase(),
    alleles: [first, second],
    raw,
  };

  return {
    ok: true,
    diplotype,
    canonical: `${first.allele}/${second.allele}`,
  };
}
