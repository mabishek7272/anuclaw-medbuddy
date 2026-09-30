import {
  AllergyRecord,
  ConditionRecord,
  Medication,
  PatientSnapshot,
} from './types';

/** Build a PatientSnapshot for tests; defaults to a complete, clean patient. */
export function makeSnapshot(
  overrides: Partial<PatientSnapshot> = {},
): PatientSnapshot {
  return {
    uid: 'test-patient',
    prescribed_drug: { name: 'codeine' },
    genotypes: [{ gene: 'CYP2D6', diplotype: '*1/*1' }],
    active_medications: { status: 'confirmed_none', items: [] },
    allergies: { status: 'confirmed_none', items: [] },
    conditions: { status: 'confirmed_none', items: [] },
    ...overrides,
  };
}

export const med = (name: string): Medication => ({ name });
export const allergy = (substance: string, cls?: string): AllergyRecord => ({
  substance,
  class: cls,
});
export const condition = (code: string): ConditionRecord => ({ code });

/** Fixed clock so verdict timestamps are deterministic in tests. */
export const fixedClock = () => new Date('2026-06-12T00:00:00.000Z');
