import { describe, it, expect } from 'vitest';
import { evaluateDecisionCore } from './index';

describe('decision core — end to end (plan §3.1 stages 5–7)', () => {
  it('decides: CYP2D6 *1/*1 + codeine -> Normal Metabolizer, standard dose', () => {
    const r = evaluateDecisionCore({
      gene: 'CYP2D6',
      diplotype: '*1/*1',
      drug: 'codeine',
    });
    expect(r.status).toBe('decided');
    if (r.status === 'decided') {
      expect(r.phenotype.phenotype).toBe('Normal Metabolizer');
      expect(r.recommendation.status).toBe('recommendation');
      if (r.recommendation.status === 'recommendation') {
        expect(r.recommendation.rule.recommendation).toMatch(/label-recommended/i);
      }
    }
  });

  it('decides: CYP2C19 *2/*2 + clopidogrel -> Poor Metabolizer, avoid', () => {
    const r = evaluateDecisionCore({
      gene: 'CYP2C19',
      diplotype: '*2/*2',
      drug: 'clopidogrel',
    });
    expect(r.status).toBe('decided');
    if (r.status === 'decided') {
      expect(r.phenotype.phenotype).toBe('Poor Metabolizer');
      expect(r.recommendation.status).toBe('recommendation');
    }
  });

  it('indeterminate: novel allele does not produce a recommendation', () => {
    const r = evaluateDecisionCore({
      gene: 'CYP2D6',
      diplotype: '*1/*999',
      drug: 'codeine',
    });
    expect(r.status).toBe('indeterminate');
  });

  it('normalisation_failed: malformed diplotype is rejected, not guessed', () => {
    const r = evaluateDecisionCore({
      gene: 'CYP2D6',
      diplotype: 'garbage',
      drug: 'codeine',
    });
    expect(r.status).toBe('normalisation_failed');
  });

  it('decided-but-no-guideline: phenotype known, drug not in table', () => {
    const r = evaluateDecisionCore({
      gene: 'CYP2D6',
      diplotype: '*1/*1',
      drug: 'warfarin',
    });
    expect(r.status).toBe('decided');
    if (r.status === 'decided') {
      expect(r.recommendation.status).toBe('no_guideline_available');
    }
  });
});
