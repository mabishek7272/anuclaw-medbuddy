/**
 * Oncology Combination Clinical Decision Module (Phase 0, WS-E).
 *
 * Proves the two review CRITICALs:
 *  - C1: a NON-PGx decision flows through a guarded path — a deterministic
 *    regimen-indication rule ORIGINATES the recommendation, grounded in
 *    guideline (not CPIC) citations.
 *  - C2 (INV-ORIG): engine/ML outputs arrive only as `supporting` evidence and
 *    can never originate — there is no path here from supporting → candidate.
 *
 * Reuses the domain-agnostic safety engines (`checkAllergies`, `checkInteractions`)
 * unchanged, plus a deterministic organ-function contraindication. No existing
 * CDS file is modified.
 */

import {
  AllergyRecord,
  ConditionRecord,
  KnownList,
  Medication,
  PatientSnapshot,
  SafetyFinding,
} from '../../safety/types';
import { checkAllergies } from '../../safety/allergy';
import { checkInteractions } from '../../safety/interaction';
import {
  ClinicalDecisionModule,
  ClinicalVerdict,
  DecideOptions,
  EvidenceCitation,
} from '../types';
import { assembleVerdict } from '../arbitrate';
import {
  ONCOLOGY_RULES_VERSION,
  guidelineCitations,
  organRules,
  regimenRules,
} from './data';

export interface OncologyQuery {
  tumor_type: string;
  stage: string;
  biomarker: string;
  line: number;
  candidate_regimen: string[];
}

export interface OncologyContext {
  organ_function: {
    lvef?: number;
    renal_egfr?: number;
    hepatic_child_pugh_score?: number;
  };
  allergies: KnownList<AllergyRecord>;
  current_medications: KnownList<Medication>;
  conditions: KnownList<ConditionRecord>;
}

const norm = (s: string) => s.trim().toLowerCase();

function setEquals(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].map(norm).sort();
  const sb = [...b].map(norm).sort();
  return sa.every((x, i) => x === sb[i]);
}

function listKnown(status: string | undefined): boolean {
  return status === 'provided' || status === 'confirmed_none';
}

export class OncologyCombinationModule
  implements ClinicalDecisionModule<OncologyQuery, OncologyContext>
{
  readonly domain = 'oncology-combination';
  readonly version = ONCOLOGY_RULES_VERSION;

  requiredContext(): string[] {
    return [
      'tumor_type',
      'stage',
      'biomarker',
      'candidate_regimen',
      'organ_function',
      'allergies',
      'current_medications',
    ];
  }

  decide(
    query: OncologyQuery,
    context: OncologyContext,
    opts?: DecideOptions,
  ): ClinicalVerdict {
    const supporting = opts?.supporting ?? [];
    const missing = this.missingFields(query, context);

    if (missing.length > 0) {
      return assembleVerdict({
        domain: this.domain,
        rule_version: this.version,
        missingData: true,
        candidate: null,
        citations: [],
        evidenceGrounded: true,
        blocks: [],
        warnings: [],
        supporting,
      });
    }

    // ── Originate (deterministic rule only) ────────────────────────────────
    const rule = regimenRules.find(
      (r) =>
        norm(r.tumor_type) === norm(query.tumor_type) &&
        norm(r.stage) === norm(query.stage) &&
        norm(r.biomarker) === norm(query.biomarker) &&
        r.line === query.line &&
        setEquals(r.regimen, query.candidate_regimen),
    );

    const candidate = rule
      ? {
          recommendation: rule.recommendation,
          strength: rule.strength,
          regimen: rule.regimen,
          citation_ids: rule.citation_ids,
          originated_by: 'deterministic_rule' as const,
        }
      : null;

    // ── Ground evidence (guideline store; no-citation ⇒ ungrounded) ────────
    const citations: EvidenceCitation[] = [];
    let evidenceGrounded = true;
    if (candidate) {
      for (const id of candidate.citation_ids) {
        const c = guidelineCitations[id];
        if (c) citations.push(c);
        else evidenceGrounded = false;
      }
    }

    // ── Safety: deterministic organ-function + reused engines ──────────────
    const { blocks, warnings } = this.safety(query.candidate_regimen, context);

    return assembleVerdict({
      domain: this.domain,
      rule_version: this.version,
      missingData: false,
      candidate,
      citations,
      evidenceGrounded,
      blocks,
      warnings,
      supporting,
    });
  }

  private missingFields(query: OncologyQuery, context: OncologyContext): string[] {
    const missing: string[] = [];
    if (!query.tumor_type) missing.push('tumor_type');
    if (!query.stage) missing.push('stage');
    if (!query.biomarker) missing.push('biomarker');
    if (!query.candidate_regimen?.length) missing.push('candidate_regimen');
    if (!context.organ_function) missing.push('organ_function');
    if (!listKnown(context.allergies?.status)) missing.push('allergies');
    if (!listKnown(context.current_medications?.status)) missing.push('current_medications');

    // Organ metric required when a regimen drug has an organ rule.
    for (const drug of query.candidate_regimen ?? []) {
      const r = organRules.find((o) => norm(o.drug) === norm(drug));
      if (r && context.organ_function?.[r.metric] === undefined) {
        missing.push(`organ_function.${r.metric}`);
      }
    }
    return missing;
  }

  private safety(
    regimen: string[],
    context: OncologyContext,
  ): { blocks: SafetyFinding[]; warnings: SafetyFinding[] } {
    const blocks: SafetyFinding[] = [];
    const warnings: SafetyFinding[] = [];
    const seen = new Set<string>();
    const add = (f: SafetyFinding) => {
      const key = `${f.action}:${f.message}`;
      if (seen.has(key)) return;
      seen.add(key);
      (f.action === 'block' ? blocks : warnings).push(f);
    };

    // Deterministic organ-function contraindication.
    for (const drug of regimen) {
      const r = organRules.find((o) => norm(o.drug) === norm(drug));
      if (!r || r.min === undefined) continue;
      const val = context.organ_function?.[r.metric];
      if (val !== undefined && val < r.min) {
        add({
          engine: 'contraindication',
          severity: 'absolute',
          action: 'block',
          message: `${drug} contraindicated: ${r.metric} ${val} below required minimum ${r.min}. ${r.rationale}`,
          citation_ids: r.citation_ids,
        });
      }
    }

    // Reuse the domain-agnostic allergy + interaction engines per regimen drug.
    for (const drug of regimen) {
      const others = regimen.filter((d) => norm(d) !== norm(drug));
      const snapshot = this.snapshotFor(drug, others, context);
      for (const f of checkAllergies(snapshot).findings) add(f);
      for (const f of checkInteractions(snapshot).findings) add(f);
    }

    return { blocks, warnings };
  }

  private snapshotFor(
    drug: string,
    others: string[],
    ctx: OncologyContext,
  ): PatientSnapshot {
    return {
      uid: 'oncology-eval',
      prescribed_drug: { name: drug },
      genotypes: [],
      active_medications: {
        status: 'provided',
        items: [...others.map((d) => ({ name: d })), ...ctx.current_medications.items],
      },
      allergies: ctx.allergies,
      conditions: ctx.conditions,
    };
  }
}
