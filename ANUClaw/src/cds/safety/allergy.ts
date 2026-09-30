/**
 * Allergy Validation Engine (plan §7.3).
 *
 * Matches the prescribed drug and its class against the patient allergy list
 * using a sealed drug-class + cross-sensitivity table.
 *   - Documented allergy to the drug or to its class -> BLOCK.
 *   - Possible class cross-sensitivity -> WARNING.
 * Pure and deterministic; fails closed via the registry integrity check.
 */

import { normaliseDrug } from '../rule-engine';
import { loadAllergyRules } from '../registry';
import {
  AllergyRecord,
  PatientSnapshot,
  SafetyFinding,
  SafetyResult,
} from './types';

export function checkAllergies(snapshot: PatientSnapshot): SafetyResult {
  const { table, integrity } = loadAllergyRules();
  const drug = normaliseDrug(snapshot.prescribed_drug?.name ?? '');
  const drugClass = table.drug_classes[drug];

  /** Resolve an allergy record's class (explicit, else inferred from substance). */
  const classOf = (a: AllergyRecord): string | undefined => {
    if (a.class?.trim()) return a.class.trim().toLowerCase();
    return table.drug_classes[normaliseDrug(a.substance)];
  };

  const findings: SafetyFinding[] = [];
  let blocked = false;

  for (const allergy of snapshot.allergies?.items ?? []) {
    const substance = normaliseDrug(allergy.substance);
    const allergyClass = classOf(allergy);

    // 1) Documented allergy to the exact drug, or to its class -> BLOCK.
    if (
      substance === drug ||
      (drugClass !== undefined && allergyClass === drugClass)
    ) {
      blocked = true;
      findings.push({
        engine: 'allergy',
        severity: 'documented',
        action: 'block',
        message: `Documented allergy to ${allergy.substance} matches the prescribed drug${
          drugClass ? ` (class: ${drugClass})` : ''
        }.`,
        citation_ids: [],
      });
      continue;
    }

    // 2) Possible cross-sensitivity by class -> WARNING.
    if (drugClass !== undefined && allergyClass !== undefined) {
      const crossClasses = table.cross_sensitivity[allergyClass] ?? [];
      if (crossClasses.includes(drugClass) && allergyClass !== drugClass) {
        findings.push({
          engine: 'allergy',
          severity: 'cross_sensitivity',
          action: 'warn',
          message: `Possible cross-sensitivity: documented ${allergyClass} allergy (${allergy.substance}) and prescribed ${drugClass}.`,
          citation_ids: [],
        });
      }
    }
  }

  const status: SafetyResult['status'] = blocked
    ? 'block'
    : findings.length > 0
      ? 'warn'
      : 'pass';

  return {
    engine: 'allergy',
    status,
    findings,
    rule_version: table.version,
    table_hash: integrity,
  };
}
