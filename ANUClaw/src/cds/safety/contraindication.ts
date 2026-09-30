/**
 * Contraindication Engine (plan §7.1).
 *
 * Checks the prescribed drug against the patient's coded conditions using a
 * sealed contraindication table. Absolute -> BLOCK; relative -> WARNING.
 * Pure and deterministic; fails closed via the registry integrity check.
 */

import { normaliseDrug } from '../rule-engine';
import { loadContraindications } from '../registry';
import { PatientSnapshot, SafetyFinding, SafetyResult } from './types';

export function checkContraindications(snapshot: PatientSnapshot): SafetyResult {
  const { table, integrity } = loadContraindications();
  const drug = normaliseDrug(snapshot.prescribed_drug?.name ?? '');

  const conditionCodes = new Set(
    (snapshot.conditions?.items ?? []).map((c) => c.code.trim().toLowerCase()),
  );

  const findings: SafetyFinding[] = [];
  for (const rule of table.rules) {
    if (rule.drug !== drug) continue;
    if (!conditionCodes.has(rule.condition_code.toLowerCase())) continue;
    findings.push({
      engine: 'contraindication',
      severity: rule.severity,
      action: rule.action,
      message: rule.rationale,
      citation_ids: rule.citation_ids,
    });
  }

  return {
    engine: 'contraindication',
    status: deriveStatus(findings),
    findings,
    rule_version: table.version,
    table_hash: integrity,
  };
}

function deriveStatus(findings: SafetyFinding[]): SafetyResult['status'] {
  if (findings.some((f) => f.action === 'block')) return 'block';
  if (findings.some((f) => f.action === 'warn')) return 'warn';
  return 'pass';
}
