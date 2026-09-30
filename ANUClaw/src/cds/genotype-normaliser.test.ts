import { describe, it, expect } from 'vitest';
import { normaliseDiplotype, parseAllele } from './genotype-normaliser';

describe('parseAllele', () => {
  it('parses standard star alleles', () => {
    expect(parseAllele('*4')).toEqual({ allele: '*4', core: '*4', copies: 1 });
    expect(parseAllele(' *41 ')).toEqual({ allele: '*41', core: '*41', copies: 1 });
  });

  it('accepts a bare number as a star allele', () => {
    expect(parseAllele('1')).toEqual({ allele: '*1', core: '*1', copies: 1 });
  });

  it('parses copy-number duplications', () => {
    expect(parseAllele('*1x2')).toEqual({ allele: '*1x2', core: '*1', copies: 2 });
    expect(parseAllele('*2x3')).toEqual({ allele: '*2x3', core: '*2', copies: 3 });
  });

  it('rejects garbage', () => {
    expect(parseAllele('')).toBeNull();
    expect(parseAllele('abc')).toBeNull();
    expect(parseAllele('*')).toBeNull();
  });
});

describe('normaliseDiplotype', () => {
  it('is order-independent (*4/*1 === *1/*4)', () => {
    const a = normaliseDiplotype('CYP2D6', '*1/*4');
    const b = normaliseDiplotype('CYP2D6', '*4/*1');
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.canonical).toBe(b.canonical);
  });

  it('canonicalises bare numbers', () => {
    const r = normaliseDiplotype('CYP2D6', '1/4');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.canonical).toBe('*1/*4');
  });

  it('preserves and orders duplications', () => {
    const r = normaliseDiplotype('CYP2D6', '*1x2/*1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.canonical).toBe('*1/*1x2');
  });

  it('uppercases the gene and retains raw input', () => {
    const r = normaliseDiplotype('cyp2d6', '*1/*2');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.diplotype.gene).toBe('CYP2D6');
      expect(r.diplotype.raw).toBe('*1/*2');
    }
  });

  it('fails (does not guess) on malformed input', () => {
    expect(normaliseDiplotype('CYP2D6', '*1').ok).toBe(false);
    expect(normaliseDiplotype('CYP2D6', '*1/*2/*3').ok).toBe(false);
    expect(normaliseDiplotype('CYP2D6', 'foo/bar').ok).toBe(false);
  });
});
