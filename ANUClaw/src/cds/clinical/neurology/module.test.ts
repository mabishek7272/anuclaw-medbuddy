import { describe, it, expect } from 'vitest';
import { NeurologyAsmModule, NeurologyContext, NeurologyQuery } from './module';

const mod = new NeurologyAsmModule();
const baseCtx = (over: Partial<NeurologyContext> = {}): NeurologyContext => ({
  factors: {},
  organ_function: {},
  allergies: { status: 'confirmed_none', items: [] },
  current_medications: { status: 'confirmed_none', items: [] },
  conditions: { status: 'confirmed_none', items: [] },
  ...over,
});
const q = (indication: string, regimen: string[], line = 1): NeurologyQuery => ({ indication, line, candidate_regimen: regimen });

describe('NeurologyAsmModule', () => {
  it('recommends a guideline-matched first-line ASM', () => {
    const v = mod.decide(q('focal-onset seizures', ['lamotrigine']), baseCtx());
    expect(v.decision).toBe('recommend');
    expect(v.recommendation?.originated_by).toBe('deterministic_rule');
    expect(v.citations.length).toBeGreaterThan(0);
  });

  it('BLOCKS valproate in a person of childbearing potential (absolute)', () => {
    const v = mod.decide(q('generalized tonic-clonic seizures', ['valproate']), baseCtx({ factors: { pregnancy_status: 'childbearing_potential' } }));
    expect(v.decision).toBe('block');
    expect(v.blocks.some((b) => /valproate/i.test(b.message))).toBe(true);
  });

  it('BLOCKS carbamazepine when HLA-B*15:02 positive (safety wins over no_guideline)', () => {
    const v = mod.decide(q('focal-onset seizures', ['carbamazepine']), baseCtx({ factors: { hla_b_1502: 'positive' } }));
    expect(v.decision).toBe('block');
  });

  it('cannot_advise: valproate without a known pregnancy status (missing data)', () => {
    const v = mod.decide(q('generalized tonic-clonic seizures', ['valproate']), baseCtx());
    expect(v.decision).toBe('cannot_advise');
    expect(v.reason_code).toBe('missing_data');
  });

  it('cannot_advise: carbamazepine with unknown HLA-B*15:02', () => {
    const v = mod.decide(q('focal-onset seizures', ['carbamazepine']), baseCtx({ factors: { hla_b_1502: 'unknown' } }));
    expect(v.decision).toBe('cannot_advise');
  });

  it('recommends valproate with a known not-applicable pregnancy status', () => {
    const v = mod.decide(q('generalized tonic-clonic seizures', ['valproate']), baseCtx({ factors: { pregnancy_status: 'not_applicable' } }));
    expect(v.decision).toBe('recommend');
  });

  it('recommend_with_warnings: levetiracetam with low eGFR', () => {
    const v = mod.decide(q('focal-onset seizures', ['levetiracetam']), baseCtx({ organ_function: { renal_egfr: 20 } }));
    expect(v.decision).toBe('recommend');
    expect(v.warnings.length).toBe(1);
    expect(v.confidence).toBe('reduced');
  });

  it('no_guideline for an unmatched indication/regimen', () => {
    const v = mod.decide(q('focal-onset seizures', ['phenytoin']), baseCtx());
    expect(v.decision).toBe('no_guideline');
  });
});
