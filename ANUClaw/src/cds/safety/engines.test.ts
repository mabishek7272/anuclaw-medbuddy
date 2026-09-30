import { describe, it, expect } from 'vitest';
import { checkMissingData, assessCompleteness } from './missing-data';
import { checkContraindications } from './contraindication';
import { checkInteractions } from './interaction';
import { checkAllergies } from './allergy';
import { makeSnapshot, med, allergy, condition } from './test-helpers';

describe('missing-data detector (plan §7.4)', () => {
  it('passes a complete snapshot', () => {
    const r = checkMissingData(makeSnapshot(), 'CYP2D6');
    expect(r.status).toBe('pass');
  });

  it('distinguishes confirmed-none (complete) from unknown (missing)', () => {
    const confirmed = checkMissingData(
      makeSnapshot({ allergies: { status: 'confirmed_none', items: [] } }),
      'CYP2D6',
    );
    expect(confirmed.status).toBe('pass');

    const unknown = checkMissingData(
      makeSnapshot({ allergies: { status: 'unknown', items: [] } }),
      'CYP2D6',
    );
    expect(unknown.status).toBe('block');
    expect(unknown.findings[0].message).toMatch(/allergies/);
  });

  it('blocks when the queried gene has no genotype', () => {
    const r = checkMissingData(
      makeSnapshot({ genotypes: [{ gene: 'CYP2C19', diplotype: '*1/*1' }] }),
      'CYP2D6',
    );
    expect(r.status).toBe('block');
    const report = assessCompleteness(
      makeSnapshot({ genotypes: [] }),
      'CYP2D6',
    );
    expect(report.missing).toContain('genotype:CYP2D6');
  });
});

describe('contraindication engine (plan §7.1)', () => {
  it('absolute contraindication -> block', () => {
    const r = checkContraindications(
      makeSnapshot({
        prescribed_drug: med('clopidogrel'),
        conditions: { status: 'provided', items: [condition('active_pathological_bleeding')] },
      }),
    );
    expect(r.status).toBe('block');
    expect(r.findings[0].severity).toBe('absolute');
    expect(r.table_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('relative contraindication -> warn', () => {
    const r = checkContraindications(
      makeSnapshot({
        prescribed_drug: med('escitalopram'),
        conditions: { status: 'provided', items: [condition('congenital_long_qt_syndrome')] },
      }),
    );
    expect(r.status).toBe('warn');
  });

  it('no matching condition -> pass', () => {
    const r = checkContraindications(
      makeSnapshot({ prescribed_drug: med('clopidogrel') }),
    );
    expect(r.status).toBe('pass');
  });
});

describe('drug-interaction engine (plan §7.2)', () => {
  it('contraindicated combination -> block', () => {
    const r = checkInteractions(
      makeSnapshot({
        prescribed_drug: med('escitalopram'),
        active_medications: { status: 'provided', items: [med('phenelzine')] },
      }),
    );
    expect(r.status).toBe('block');
  });

  it('major interaction -> warn, order-independent', () => {
    const r = checkInteractions(
      makeSnapshot({
        prescribed_drug: med('clopidogrel'),
        active_medications: { status: 'provided', items: [med('Omeprazole')] },
      }),
    );
    expect(r.status).toBe('warn');
    expect(r.findings[0].message).toMatch(/omeprazole/i);
  });

  it('no interacting med -> pass', () => {
    const r = checkInteractions(
      makeSnapshot({
        prescribed_drug: med('clopidogrel'),
        active_medications: { status: 'provided', items: [med('paracetamol')] },
      }),
    );
    expect(r.status).toBe('pass');
  });
});

describe('allergy engine (plan §7.3)', () => {
  it('documented allergy to the drug -> block', () => {
    const r = checkAllergies(
      makeSnapshot({
        prescribed_drug: med('codeine'),
        allergies: { status: 'provided', items: [allergy('codeine')] },
      }),
    );
    expect(r.status).toBe('block');
    expect(r.findings[0].severity).toBe('documented');
  });

  it('same-class allergy (different substance) -> block', () => {
    const r = checkAllergies(
      makeSnapshot({
        prescribed_drug: med('codeine'),
        allergies: { status: 'provided', items: [allergy('morphine')] },
      }),
    );
    expect(r.status).toBe('block');
  });

  it('cross-class cross-sensitivity -> warn (penicillin -> cephalosporin)', () => {
    const r = checkAllergies(
      makeSnapshot({
        prescribed_drug: med('cefalexin'),
        allergies: { status: 'provided', items: [allergy('amoxicillin')] },
      }),
    );
    expect(r.status).toBe('warn');
    expect(r.findings[0].severity).toBe('cross_sensitivity');
  });

  it('unrelated allergy -> pass', () => {
    const r = checkAllergies(
      makeSnapshot({
        prescribed_drug: med('codeine'),
        allergies: { status: 'provided', items: [allergy('penicillin')] },
      }),
    );
    expect(r.status).toBe('pass');
  });
});
