/**
 * ANUClaw v3 — Clinical Decision Support: core domain types.
 *
 * This module is the DETERMINISTIC DECISION CORE described in the v3 plan
 * (§2.1 "Deterministic decision core", §4.1 Phenotype Engine, §4.2 Rule Engine).
 *
 * INVARIANT: nothing in `src/cds` may import an LLM/agent/model. The decision
 * core is pure and referentially transparent — identical input always yields
 * identical output for a given, integrity-verified data version.
 */

// ── Allele & phenotype vocabulary ─────────────────────────────────────────────

/** Functional status of a star-allele, per CPIC allele functionality tables. */
export type AlleleFunction =
  | 'increased'
  | 'normal'
  | 'decreased'
  | 'no_function'
  | 'unknown';

/** Standardised metabolizer phenotypes (CPIC/DPWG 2019 consensus terms). */
export type Phenotype =
  | 'Ultrarapid Metabolizer'
  | 'Rapid Metabolizer'
  | 'Normal Metabolizer'
  | 'Intermediate Metabolizer'
  | 'Poor Metabolizer'
  | 'Indeterminate';

/** How a gene's diplotype is converted to a phenotype. */
export type PhenotypeMethod =
  /** CYP2D6-style: sum of per-allele activity values, then threshold ranges. */
  | 'activity_score'
  /** CYP2C19-style: lookup on the (sorted) pair of allele functions. */
  | 'diplotype_function';

// ── Gene definition (a versioned, hashed, change-controlled data file) ─────────

export interface AlleleDefinition {
  /** CPIC functional status. */
  function: AlleleFunction;
  /** Activity contribution; required for `activity_score` genes. */
  activity_value?: number;
}

export interface PhenotypeThreshold {
  phenotype: Phenotype;
  /** Lower bound of the activity-score band. */
  min: number;
  /** Upper bound; `null` means unbounded above. */
  max: number | null;
  min_inclusive: boolean;
  max_inclusive: boolean;
}

export interface GeneDefinition {
  /** Stable identifier used by the integrity manifest, e.g. 'cyp2d6'. */
  data_id: string;
  /** Gene symbol, e.g. 'CYP2D6'. */
  gene: string;
  method: PhenotypeMethod;
  /** Data version, recorded into every assignment, e.g. '2024.1'. */
  version: string;
  source: string;
  effective_date: string;
  /** Governance notice — seed data must be SME-validated before clinical use. */
  notice: string;
  /** Star-allele → functional definition. Keyed by core allele, e.g. '*4'. */
  alleles: Record<string, AlleleDefinition>;
  /** Required for `activity_score` genes. */
  phenotype_thresholds?: PhenotypeThreshold[];
  /** Required for `diplotype_function` genes; keyed by sorted 'f1+f2'. */
  function_phenotype_map?: Record<string, Phenotype>;
}

// ── Genotype normalisation ─────────────────────────────────────────────────────

export interface ParsedAllele {
  /** Canonical token, e.g. '*4' or '*1x2' (duplication). */
  allele: string;
  /** Core allele without copy-number suffix, e.g. '*1'. */
  core: string;
  /** Copy number (>=1); >1 denotes a structural duplication (`*NxM`). */
  copies: number;
}

export interface Diplotype {
  gene: string;
  /** Exactly two alleles, in canonical sorted order. */
  alleles: [ParsedAllele, ParsedAllele];
  /** The raw input as received, retained for audit. */
  raw: string;
}

export type NormaliseResult =
  | { ok: true; diplotype: Diplotype; canonical: string }
  | { ok: false; reason: string };

// ── Phenotype assignment (the engine output, fully audit-reproducible) ─────────

export interface PhenotypeAssignment {
  gene: string;
  /** Canonical 'a/b' diplotype string. */
  diplotype: string;
  phenotype: Phenotype;
  /** Present for activity_score genes; `null` otherwise. */
  activity_score: number | null;
  method: PhenotypeMethod;
  indeterminate: boolean;
  /** Why a result is indeterminate (novel allele, no band, etc.); else `null`. */
  reason: string | null;
  /** Gene data version used. */
  rule_version: string;
  /** SHA-256 integrity hash of the gene data file used. */
  table_hash: string;
}

// ── CPIC rule table (a versioned, hashed, change-controlled data file) ─────────

export type RecommendationStrength =
  | 'Strong'
  | 'Moderate'
  | 'Optional'
  | 'No recommendation';

export interface CpicRule {
  gene: string;
  /** Normalised (lower-case) drug name. */
  drug: string;
  phenotype: Phenotype;
  recommendation: string;
  strength: RecommendationStrength;
  cpic_version: string;
  /** Guideline + primary-literature identifiers flowing into evidence/audit. */
  citation_ids: string[];
  effective_date: string;
}

export interface RuleTable {
  data_id: string;
  version: string;
  source: string;
  notice: string;
  rules: CpicRule[];
}

export type RuleLookupResult =
  | {
      status: 'recommendation';
      rule: CpicRule;
      table_version: string;
      table_hash: string;
    }
  | {
      status: 'no_guideline_available';
      gene: string;
      drug: string;
      phenotype: Phenotype;
      table_version: string;
      table_hash: string;
    };
