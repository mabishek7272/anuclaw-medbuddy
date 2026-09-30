/**
 * Missing-Data Detector (plan §7.4, §3.1 stage 4).
 *
 * Verifies every field required for a safe PGx recommendation is present and
 * valid. Crucially distinguishes "absent" from "confirmed none": an empty but
 * `confirmed_none` medication/allergy list is COMPLETE, whereas `unknown` is
 * missing data → 'cannot advise' rather than a guess.
 *
 * Pure and deterministic; uses no rule table (hence empty provenance fields).
 */

import { PatientSnapshot, SafetyFinding, SafetyResult } from './types';

export interface CompletenessReport {
  complete: boolean;
  required: string[];
  present: string[];
  missing: string[];
}

/** Field-level completeness assessment for the queried gene. */
export function assessCompleteness(
  snapshot: PatientSnapshot,
  gene: string,
): CompletenessReport {
  const required = [
    'prescribed_drug',
    `genotype:${gene}`,
    'active_medications',
    'allergies',
    'conditions',
  ];
  const present: string[] = [];
  const missing: string[] = [];

  // Prescribed drug must have a non-empty name.
  if (snapshot.prescribed_drug && snapshot.prescribed_drug.name?.trim()) {
    present.push('prescribed_drug');
  } else {
    missing.push('prescribed_drug');
  }

  // A genotype for the queried gene must be present and non-empty.
  const geneU = gene.trim().toUpperCase();
  const hasGenotype = snapshot.genotypes?.some(
    (g) => g.gene?.trim().toUpperCase() === geneU && g.diplotype?.trim(),
  );
  (hasGenotype ? present : missing).push(`genotype:${gene}`);

  // Lists: 'unknown' is missing; 'provided'/'confirmed_none' are complete.
  const listKnown = (status: string | undefined) =>
    status === 'provided' || status === 'confirmed_none';

  (listKnown(snapshot.active_medications?.status) ? present : missing).push(
    'active_medications',
  );
  (listKnown(snapshot.allergies?.status) ? present : missing).push('allergies');
  (listKnown(snapshot.conditions?.status) ? present : missing).push(
    'conditions',
  );

  return { complete: missing.length === 0, required, present, missing };
}

/**
 * Run the missing-data detector. A `block` status means the pipeline must
 * return 'cannot advise: missing data' (plan §3.2 invariant).
 */
export function checkMissingData(
  snapshot: PatientSnapshot,
  gene: string,
): SafetyResult {
  const report = assessCompleteness(snapshot, gene);

  const findings: SafetyFinding[] = report.complete
    ? []
    : [
        {
          engine: 'missing_data',
          severity: 'incomplete',
          action: 'block',
          message: `Cannot advise: missing required data — ${report.missing.join(', ')}.`,
          citation_ids: [],
        },
      ];

  return {
    engine: 'missing_data',
    status: report.complete ? 'pass' : 'block',
    findings,
    rule_version: '',
    table_hash: '',
  };
}
