import { describe, it, expect } from 'vitest';
import { OncologyCombinationModule, OncologyContext, OncologyQuery } from './oncology/module';
import { SupportingEvidenceItem } from './types';

const mod = new OncologyCombinationModule();

const HER2: OncologyQuery = {
  tumor_type: 'breast',
  stage: 'II',
  biomarker: 'HER2+',
  line: 1,
  candidate_regimen: ['trastuzumab', 'pertuzumab', 'docetaxel'],
};

function ctx(over: Partial<OncologyContext> = {}): OncologyContext {
  return {
    organ_function: { lvef: 60 },
    allergies: { status: 'confirmed_none', items: [] },
    current_medications: { status: 'confirmed_none', items: [] },
    conditions: { status: 'confirmed_none', items: [] },
    ...over,
  };
}

const synergy = (inputHash: string, confidence = 0.95): SupportingEvidenceItem => ({
  engine_id: 'synergy',
  engine_version: '1.0.0',
  input_hash: inputHash,
  kind: 'synergy',
  summary: 'predicted synergistic combination',
  confidence,
  reproducibility_class: 'deterministic',
});

describe('oncology module — C1: non-PGx deterministic decision path', () => {
  it('recommends a guideline-indicated regimen, grounded in guideline citations', () => {
    const v = mod.decide(HER2, ctx());
    expect(v.decision).toBe('recommend');
    expect(v.recommendation?.originated_by).toBe('deterministic_rule');
    expect(v.recommendation?.regimen).toEqual(['trastuzumab', 'pertuzumab', 'docetaxel']);
    expect(v.citations.map((c) => c.source)).toContain('NCCN');
    expect(v.confidence).toBe('high');
    expect(v.verdict_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('no_guideline when no deterministic rule matches the regimen', () => {
    const v = mod.decide({ ...HER2, candidate_regimen: ['tamoxifen'] }, ctx());
    expect(v.decision).toBe('no_guideline');
    expect(v.recommendation).toBeNull();
  });

  it('cannot_advise when required context is missing', () => {
    const v = mod.decide(HER2, ctx({ organ_function: {} })); // LVEF required for trastuzumab
    expect(v.decision).toBe('cannot_advise');
    expect(v.reason_code).toBe('missing_data');
  });
});

describe('oncology module — safety blocks (reused engines + organ rule)', () => {
  it('blocks on organ-function contraindication (low LVEF)', () => {
    const v = mod.decide(HER2, ctx({ organ_function: { lvef: 40 } }));
    expect(v.decision).toBe('block');
    expect(v.reason_code).toBe('safety_block');
    expect(v.blocks.some((b) => /lvef/i.test(b.message))).toBe(true);
    expect(v.recommendation).toBeNull(); // suppressed
  });

  it('blocks on a documented allergy via the reused allergy engine', () => {
    const v = mod.decide(
      HER2,
      ctx({ allergies: { status: 'provided', items: [{ substance: 'docetaxel' }] } }),
    );
    expect(v.decision).toBe('block');
    expect(v.blocks.some((b) => b.engine === 'allergy')).toBe(true);
  });
});

describe('oncology module — C2: Origination Invariant (INV-ORIG)', () => {
  it('HAZARD: high-confidence synergy + NO deterministic indication ⇒ NOT recommend', () => {
    const v = mod.decide(
      { ...HER2, candidate_regimen: ['experimental-x', 'experimental-y'] }, // no rule
      ctx(),
      { supporting: [synergy('hash-A', 0.99)] },
    );
    // engine evidence cannot originate a recommendation
    expect(v.decision).toBe('no_guideline');
    expect(v.recommendation).toBeNull();
  });

  it('supporting evidence is attached to a rule-originated recommend, never the basis', () => {
    const v = mod.decide(HER2, ctx(), { supporting: [synergy('hash-A')] });
    expect(v.decision).toBe('recommend');
    expect(v.recommendation?.originated_by).toBe('deterministic_rule');
    expect(v.supporting_evidence).toHaveLength(1);
    expect(v.supporting_evidence[0].kind).toBe('synergy');
  });

  it('verdict_hash binds engine provenance (Spec 4): different engine input ⇒ different hash', () => {
    const a = mod.decide(HER2, ctx(), { supporting: [synergy('hash-A')] });
    const b = mod.decide(HER2, ctx(), { supporting: [synergy('hash-B')] });
    expect(a.verdict_hash).not.toBe(b.verdict_hash);
  });

  it('same inputs ⇒ identical verdict_hash (deterministic, reproducible)', () => {
    const a = mod.decide(HER2, ctx(), { supporting: [synergy('hash-A')] });
    const b = mod.decide(HER2, ctx(), { supporting: [synergy('hash-A')] });
    expect(a.verdict_hash).toBe(b.verdict_hash);
  });
});
