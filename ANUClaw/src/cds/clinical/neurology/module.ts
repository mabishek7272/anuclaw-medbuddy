/**
 * Neurology Antiseizure Medication Clinical Decision Module (Phase 0, WS-E).
 *
 * The SECOND clinical domain — proves the platform generalizes beyond oncology
 * with NO change to the decision core, arbitrator, or safety mechanism:
 *  - A deterministic indication→regimen table ORIGINATES the recommendation
 *    (INV-ORIG); engine/ML outputs only ever arrive as `supporting` evidence.
 *  - Deterministic factor rules ORIGINATE absolute blocks (valproate in
 *    pregnancy; carbamazepine with HLA-B*15:02) — safety wins.
 *  - Responsible missing-data gating: it will not recommend valproate without a
 *    known pregnancy status, nor carbamazepine without a known HLA-B*15:02 status.
 *
 * Reuses the domain-agnostic allergy + interaction engines unchanged.
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
  NEUROLOGY_RULES_VERSION,
  asmRules,
  guidelineCitations,
  safetyRules,
} from './data';

export interface NeurologyPatientFactors {
  pregnancy_status?: 'pregnant' | 'childbearing_potential' | 'not_applicable';
  hla_b_1502?: 'positive' | 'negative' | 'unknown';
}

export interface NeurologyQuery {
  indication: string;
  line: number;
  candidate_regimen: string[];
}

export interface NeurologyContext {
  factors: NeurologyPatientFactors;
  organ_function: { renal_egfr?: number; hepatic_child_pugh_score?: number };
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

export class NeurologyAsmModule
  implements ClinicalDecisionModule<NeurologyQuery, NeurologyContext>
{
  readonly domain = 'neurology-combination';
  readonly version = NEUROLOGY_RULES_VERSION;

  requiredContext(): string[] {
    return ['indication', 'candidate_regimen', 'factors', 'allergies', 'current_medications'];
  }

  decide(
    query: NeurologyQuery,
    context: NeurologyContext,
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

    // ── Originate (deterministic indication-match only) ────────────────────
    const rule = asmRules.find(
      (r) =>
        norm(r.indication) === norm(query.indication) &&
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

    // ── Ground evidence ────────────────────────────────────────────────────
    const citations: EvidenceCitation[] = [];
    let evidenceGrounded = true;
    if (candidate) {
      for (const id of candidate.citation_ids) {
        const c = guidelineCitations[id];
        if (c) citations.push(c);
        else evidenceGrounded = false;
      }
    }

    // ── Safety: deterministic factor/organ rules + reused engines ──────────
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

  private missingFields(query: NeurologyQuery, context: NeurologyContext): string[] {
    const missing: string[] = [];
    if (!query.indication) missing.push('indication');
    if (!query.candidate_regimen?.length) missing.push('candidate_regimen');
    if (!listKnown(context.allergies?.status)) missing.push('allergies');
    if (!listKnown(context.current_medications?.status)) missing.push('current_medications');

    const regimen = query.candidate_regimen ?? [];
    const has = (d: string) => regimen.some((x) => norm(x) === d);

    // Don't recommend valproate without a known pregnancy status (safety-critical).
    if (has('valproate') && !context.factors?.pregnancy_status) {
      missing.push('factors.pregnancy_status');
    }
    // Don't recommend carbamazepine without a resolved HLA-B*15:02 status.
    if (has('carbamazepine')) {
      const hla = context.factors?.hla_b_1502;
      if (!hla || hla === 'unknown') missing.push('factors.hla_b_1502');
    }
    return missing;
  }

  private safety(
    regimen: string[],
    context: NeurologyContext,
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

    for (const drug of regimen) {
      for (const r of safetyRules.filter((s) => norm(s.drug) === norm(drug))) {
        let triggered = false;
        if (r.factor === 'renal_egfr') {
          const v = context.organ_function?.renal_egfr;
          triggered = v !== undefined && r.min !== undefined && v < r.min;
        } else {
          const v = r.factor === 'pregnancy_status'
            ? context.factors?.pregnancy_status
            : context.factors?.hla_b_1502;
          triggered = v !== undefined && (r.triggers ?? []).includes(v);
        }
        if (!triggered) continue;
        add({
          engine: 'contraindication',
          severity: r.severity,
          action: r.action,
          message: `${drug}: ${r.rationale}`,
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
    ctx: NeurologyContext,
  ): PatientSnapshot {
    return {
      uid: 'neurology-eval',
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
