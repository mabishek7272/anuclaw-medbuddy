import { describe, it, expect } from 'vitest';
import {
  loadGene,
  loadRules,
  assertIntegrity,
  computeIntegrity,
  CdsIntegrityError,
  resolveGeneId,
} from './registry';
import { cyp2d6 } from './data/cyp2d6';

describe('registry — integrity verification (plan §3.3, §4.1.3)', () => {
  it('loads a sealed gene whose hash matches the manifest', () => {
    const loaded = loadGene('CYP2D6');
    expect(loaded.definition.gene).toBe('CYP2D6');
    expect(loaded.integrity).toBe(computeIntegrity(cyp2d6));
    expect(loaded.integrity).toMatch(/^[a-f0-9]{64}$/);
  });

  it('loads the sealed rule table', () => {
    const r = loadRules();
    expect(r.table.data_id).toBe('cpic_rules');
    expect(r.integrity).toMatch(/^[a-f0-9]{64}$/);
  });

  it('resolves gene symbols to data ids', () => {
    expect(resolveGeneId('CYP2D6')).toBe('cyp2d6');
    expect(resolveGeneId('cyp2c19')).toBe('cyp2c19');
    expect(resolveGeneId('BRCA1')).toBeNull();
  });

  it('FAILS CLOSED when a data file is tampered with (uncontrolled edit)', () => {
    const tampered = {
      ...cyp2d6,
      alleles: {
        ...cyp2d6.alleles,
        '*4': { function: 'normal' as const, activity_value: 1.0 }, // silently flip *4
      },
    };
    expect(() => assertIntegrity('cyp2d6', tampered)).toThrow(CdsIntegrityError);
  });

  it('FAILS CLOSED when there is no manifest entry', () => {
    expect(() => assertIntegrity('nonexistent_table', {})).toThrow(CdsIntegrityError);
  });

  it('throws on an unknown gene', () => {
    expect(() => loadGene('BRCA1')).toThrow(CdsIntegrityError);
  });
});
