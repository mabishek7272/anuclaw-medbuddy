import { describe, it, expect } from 'vitest';
import { handleHook, cdsServiceDescriptor, SERVICE_ID } from './cds-hooks';
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

function genotypeObs(gene: string, diplotype: string): Observation {
  return { resourceType: 'Observation', code: { text: `${gene} genotype` }, valueString: diplotype };
}

/** A complete order-sign request: drug + genotype + present (empty) lists. */
function request(
  drug: string,
  genotypes: Observation[],
  overrides: Partial<CdsHookRequest['prefetch']> = {},
): CdsHookRequest {
  return {
    hook: 'order-sign',
    context: {
      patientId: 'p1',
      draftOrders: bundle<MedicationResource>([
        { resourceType: 'MedicationRequest', medicationCodeableConcept: { text: drug } },
      ]),
    },
    prefetch: {
      genotypes: bundle(genotypes),
      medications: bundle<MedicationResource>([]),
      allergies: bundle<AllergyIntolerance>([]),
      conditions: bundle<Condition>([]),
      ...overrides,
    },
  };
}

describe('CDS Hooks discovery', () => {
  it('describes the PGx service with prefetch templates', () => {
    const d = cdsServiceDescriptor();
    expect(d.id).toBe(SERVICE_ID);
    expect(d.hook).toBe('order-sign');
    expect(Object.keys(d.prefetch)).toEqual(
      expect.arrayContaining(['genotypes', 'medications', 'allergies', 'conditions']),
    );
  });
});

describe('CDS Hooks handler (plan §6.3)', () => {
  it('recommend: codeine + CYP2D6 *1/*1 → one info card', async () => {
    const { cards } = await handleHook(request('Codeine', [genotypeObs('CYP2D6', '*1/*1')]));
    expect(cards).toHaveLength(1);
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary).toMatch(/codeine/i);
    expect(cards[0].source.label).toMatch(/CPIC/);
  });

  it('critical block: codeine with a documented codeine allergy', async () => {
    const { cards } = await handleHook(
      request('Codeine', [genotypeObs('CYP2D6', '*1/*1')], {
        allergies: bundle<AllergyIntolerance>([{ code: { text: 'Codeine' } }]),
      }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/do not use/i);
    expect(cards[0].detail).toMatch(/safety block/i);
  });

  it('grounded evidence yields a PMID link', async () => {
    const { cards } = await handleHook(request('clopidogrel', [genotypeObs('CYP2C19', '*2/*2')]));
    expect(cards).toHaveLength(1);
    expect(cards[0].links?.some((l) => /pubmed/i.test(l.url))).toBe(true);
  });

  it('cannot_advise (warning) when the required genotype is absent', async () => {
    const { cards } = await handleHook(request('Codeine', [])); // no genotype observations
    expect(cards).toHaveLength(1);
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/unable to advise/i);
  });

  it('says nothing for a non-PGx drug', async () => {
    const { cards } = await handleHook(request('Aspirin', [genotypeObs('CYP2D6', '*1/*1')]));
    expect(cards).toHaveLength(0);
  });

  it('ignores unsupported hooks', async () => {
    const req = { ...request('Codeine', [genotypeObs('CYP2D6', '*1/*1')]), hook: 'patient-view' };
    const { cards } = await handleHook(req);
    expect(cards).toHaveLength(0);
  });
});
