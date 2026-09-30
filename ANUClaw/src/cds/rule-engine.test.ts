import { describe, it, expect } from 'vitest';
import { lookupRecommendation } from './rule-engine';

describe('CPIC rule engine — exact match (plan §4.2.2)', () => {
  it('returns the recommendation for a known triple', () => {
    const r = lookupRecommendation('CYP2C19', 'clopidogrel', 'Poor Metabolizer');
    expect(r.status).toBe('recommendation');
    if (r.status === 'recommendation') {
      expect(r.rule.recommendation).toMatch(/Avoid standard-dose/i);
      expect(r.rule.strength).toBe('Strong');
      expect(r.rule.citation_ids.length).toBeGreaterThan(0);
      expect(r.table_version).toBe('2024.1');
      expect(r.table_hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('matches drug names case-insensitively', () => {
    const r = lookupRecommendation('CYP2D6', 'Codeine', 'Ultrarapid Metabolizer');
    expect(r.status).toBe('recommendation');
    if (r.status === 'recommendation') {
      expect(r.rule.recommendation).toMatch(/Avoid codeine/i);
    }
  });

  it('never extrapolates: unknown triple -> no_guideline_available', () => {
    const r = lookupRecommendation('CYP2D6', 'aspirin', 'Normal Metabolizer');
    expect(r.status).toBe('no_guideline_available');
    if (r.status === 'no_guideline_available') {
      expect(r.gene).toBe('CYP2D6');
      expect(r.drug).toBe('aspirin');
      expect(r.table_hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('does not return a rule for a phenotype with no entry', () => {
    // escitalopram has no Intermediate Metabolizer rule in the seed table.
    const r = lookupRecommendation('CYP2C19', 'escitalopram', 'Intermediate Metabolizer');
    expect(r.status).toBe('no_guideline_available');
  });
});
