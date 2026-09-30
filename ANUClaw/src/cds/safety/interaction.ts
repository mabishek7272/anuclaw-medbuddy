/**
 * Drug-Drug Interaction Engine (plan §7.2).
 *
 * Cross-checks the prescribed drug against the active medication list using a
 * sealed DDI table, matched order-independently on the drug pair.
 * contraindicated -> BLOCK; major/moderate -> WARNING.
 * Pure and deterministic; fails closed via the registry integrity check.
 */

import { normaliseDrug } from '../rule-engine';
import { loadInteractions } from '../registry';
import { PatientSnapshot, SafetyFinding, SafetyResult } from './types';

export function checkInteractions(snapshot: PatientSnapshot): SafetyResult {
  const { table, integrity } = loadInteractions();
  const drug = normaliseDrug(snapshot.prescribed_drug?.name ?? '');

  const activeMeds = new Set(
    (snapshot.active_medications?.items ?? []).map((m) => normaliseDrug(m.name)),
  );

  const findings: SafetyFinding[] = [];
  for (const rule of table.rules) {
    const a = normaliseDrug(rule.drug_a);
    const b = normaliseDrug(rule.drug_b);
    // Order-independent: prescribed drug is one side, an active med the other.
    const matches =
      (a === drug && activeMeds.has(b)) || (b === drug && activeMeds.has(a));
    if (!matches) continue;

    const other = a === drug ? b : a;
    findings.push({
      engine: 'interaction',
      severity: rule.severity,
      action: rule.action,
      message: `${rule.rationale} (interacting medication: ${other})`,
      citation_ids: rule.citation_ids,
    });
  }

  return {
    engine: 'interaction',
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
