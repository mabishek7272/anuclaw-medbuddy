/**
 * A sample CDS Hooks request for the review demo page.
 *
 * Two orders for one patient, exercising two outcomes:
 *   - clopidogrel + CYP2C19 *2/*2 (Poor Metabolizer) → avoid → WARNING card
 *   - codeine + CYP2D6 *1x2/*1 (Ultrarapid) with a codeine allergy → BLOCK
 *     → CRITICAL card (safety overrides the recommendation)
 */

import {
  AllergyIntolerance,
  Bundle,
  CdsHookRequest,
  Condition,
  MedicationResource,
  Observation,
} from '../fhir/types';

function bundle<T>(resources: T[]): Bundle<T> {
  return { resourceType: 'Bundle', entry: resources.map((r) => ({ resource: r })) };
}

export const DEMO_REQUEST: CdsHookRequest = {
  hook: 'order-sign',
  context: {
    patientId: 'demo-patient-001',
    draftOrders: bundle<MedicationResource>([
      { resourceType: 'MedicationRequest', medicationCodeableConcept: { text: 'Clopidogrel' } },
      { resourceType: 'MedicationRequest', medicationCodeableConcept: { text: 'Codeine' } },
    ]),
  },
  prefetch: {
    genotypes: bundle<Observation>([
      { resourceType: 'Observation', code: { text: 'CYP2C19 genotype' }, valueString: '*2/*2' },
      { resourceType: 'Observation', code: { text: 'CYP2D6 genotype' }, valueString: '*1x2/*1' },
    ]),
    medications: bundle<MedicationResource>([]),
    allergies: bundle<AllergyIntolerance>([{ code: { text: 'Codeine' } }]),
    conditions: bundle<Condition>([]),
  },
};
