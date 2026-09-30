import { describe, it, expect } from 'vitest';
import {
  buildSnapshot,
  prescribedMedications,
  normaliseConditionCode,
} from './snapshot-from-fhir';
import {
  AllergyIntolerance,
  Bundle,
  CdsHookRequest,
  Condition,
  MedicationResource,
  Observation,
} from './types';

function bundle<T>(resources: T[]): Bundle<T> {
  return { resourceType: 'Bundle', entry: resources.map((r) => ({ resource: r })) };
}

const codeineOrder: MedicationResource = {
  resourceType: 'MedicationRequest',
  medicationCodeableConcept: { text: 'Codeine' },
};

function request(prefetch: CdsHookRequest['prefetch']): CdsHookRequest {
  return {
    hook: 'order-sign',
    context: { patientId: 'p1', draftOrders: bundle([codeineOrder]) },
    prefetch,
  };
}

describe('FHIR normaliser — prescribed drug', () => {
  it('reads the prescribed drug from draftOrders', () => {
    expect(prescribedMedications(request({}))).toEqual([{ name: 'codeine' }]);
  });
});

describe('FHIR normaliser — genomic Observations', () => {
  it('parses a value-string genotype Observation', () => {
    const obs: Observation = {
      resourceType: 'Observation',
      code: { text: 'CYP2D6 genotype' },
      valueString: '*1/*4',
    };
    const snap = buildSnapshot(request({ genotypes: bundle([obs]) }), { name: 'codeine' });
    expect(snap.genotypes).toEqual([{ gene: 'CYP2D6', diplotype: '*1/*4', source: 'FHIR' }]);
  });

  it('parses a component-based panel Observation', () => {
    const obs: Observation = {
      resourceType: 'Observation',
      code: { text: 'PGx panel' },
      component: [
        { code: { text: 'Gene studied' }, valueCodeableConcept: { text: 'CYP2C19' } },
        { code: { text: 'Genotype' }, valueString: '*2/*2' },
      ],
    };
    const snap = buildSnapshot(request({ genotypes: bundle([obs]) }), { name: 'codeine' });
    expect(snap.genotypes).toEqual([{ gene: 'CYP2C19', diplotype: '*2/*2', source: 'FHIR' }]);
  });
});

describe('FHIR normaliser — absent vs confirmed-none vs unknown (plan §7.4)', () => {
  it('missing prefetch key → unknown', () => {
    const snap = buildSnapshot(request({}), { name: 'codeine' });
    expect(snap.allergies.status).toBe('unknown');
    expect(snap.conditions.status).toBe('unknown');
    expect(snap.active_medications.status).toBe('unknown');
  });

  it('present but empty searchset → confirmed_none', () => {
    const snap = buildSnapshot(
      request({
        allergies: bundle<AllergyIntolerance>([]),
        conditions: bundle<Condition>([]),
        medications: bundle<MedicationResource>([]),
      }),
      { name: 'codeine' },
    );
    expect(snap.allergies.status).toBe('confirmed_none');
    expect(snap.conditions.status).toBe('confirmed_none');
    expect(snap.active_medications.status).toBe('confirmed_none');
  });

  it('explicit "no known allergies" record → confirmed_none', () => {
    const nka: AllergyIntolerance = {
      resourceType: 'AllergyIntolerance',
      code: { coding: [{ code: '716186003', display: 'No known allergy' }] },
    };
    const snap = buildSnapshot(request({ allergies: bundle([nka]) }), { name: 'codeine' });
    expect(snap.allergies.status).toBe('confirmed_none');
    expect(snap.allergies.items).toHaveLength(0);
  });

  it('populated lists → provided, with normalised values', () => {
    const snap = buildSnapshot(
      request({
        allergies: bundle<AllergyIntolerance>([{ code: { text: 'Codeine' } }]),
        medications: bundle<MedicationResource>([
          { medicationCodeableConcept: { text: 'Omeprazole' } },
        ]),
        conditions: bundle<Condition>([{ code: { text: 'Active pathological bleeding' } }]),
      }),
      { name: 'codeine' },
    );
    expect(snap.allergies).toEqual({ status: 'provided', items: [{ substance: 'codeine' }] });
    expect(snap.active_medications.items).toEqual([{ name: 'omeprazole' }]);
    expect(snap.conditions.items).toEqual([
      { code: 'active_pathological_bleeding', display: 'Active pathological bleeding' },
    ]);
  });
});

describe('normaliseConditionCode', () => {
  it('snake-cases free text', () => {
    expect(normaliseConditionCode('Active Pathological Bleeding')).toBe('active_pathological_bleeding');
    expect(normaliseConditionCode('  Severe respiratory depression! ')).toBe('severe_respiratory_depression');
  });
});
