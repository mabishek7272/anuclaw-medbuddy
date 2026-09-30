import { describe, it, expect } from 'vitest';
import { loadGene } from './registry';
import { normaliseDiplotype } from './genotype-normaliser';
import { assignPhenotype } from './phenotype-engine';
import { Phenotype } from './types';

/** Assign a phenotype straight from a raw diplotype string. */
function pheno(gene: string, raw: string) {
  const loaded = loadGene(gene);
  const norm = normaliseDiplotype(gene, raw);
  if (!norm.ok) throw new Error(`normalise failed: ${norm.reason}`);
  return assignPhenotype(loaded, norm.diplotype);
}

describe('phenotype engine — CYP2D6 (activity score)', () => {
  // Golden dataset: must pass 100% (plan §8.2).
  const golden: Array<[string, Phenotype, number]> = [
    ['*1/*1', 'Normal Metabolizer', 2.0],
    ['*1/*2', 'Normal Metabolizer', 2.0],
    ['*1/*4', 'Intermediate Metabolizer', 1.0], // plan §4.1.2 worked example
    ['*4/*4', 'Poor Metabolizer', 0.0], // plan §4.1.2 worked example
    ['*4/*5', 'Poor Metabolizer', 0.0],
    ['*1/*10', 'Normal Metabolizer', 1.25],
    ['*10/*10', 'Intermediate Metabolizer', 0.5],
    ['*4/*10', 'Intermediate Metabolizer', 0.25],
    ['*4/*41', 'Intermediate Metabolizer', 0.25],
    ['*1x2/*1', 'Ultrarapid Metabolizer', 3.0], // duplication reaches UM band
    ['*2x2/*4', 'Normal Metabolizer', 2.0], // dup of functional + no-function
  ];

  it.each(golden)('%s -> %s (AS %f)', (raw, expected, score) => {
    const r = pheno('CYP2D6', raw);
    expect(r.indeterminate).toBe(false);
    expect(r.phenotype).toBe(expected);
    expect(r.activity_score).toBe(score);
  });

  it('records provenance (version + table hash) on every assignment', () => {
    const r = pheno('CYP2D6', '*1/*4');
    expect(r.rule_version).toBe('2024.1');
    expect(r.table_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(r.method).toBe('activity_score');
  });

  it('returns Indeterminate for a novel/unannotated allele (never guesses)', () => {
    const r = pheno('CYP2D6', '*1/*999');
    expect(r.indeterminate).toBe(true);
    expect(r.phenotype).toBe('Indeterminate');
    expect(r.reason).toMatch(/Unannotated allele/);
  });
});

describe('phenotype engine — CYP2C19 (diplotype function)', () => {
  const golden: Array<[string, Phenotype]> = [
    ['*1/*1', 'Normal Metabolizer'],
    ['*1/*17', 'Rapid Metabolizer'],
    ['*17/*17', 'Ultrarapid Metabolizer'],
    ['*1/*2', 'Intermediate Metabolizer'],
    ['*2/*17', 'Intermediate Metabolizer'],
    ['*2/*2', 'Poor Metabolizer'],
    ['*2/*3', 'Poor Metabolizer'],
  ];

  it.each(golden)('%s -> %s', (raw, expected) => {
    const r = pheno('CYP2C19', raw);
    expect(r.indeterminate).toBe(false);
    expect(r.phenotype).toBe(expected);
    expect(r.activity_score).toBeNull();
  });

  it('returns Indeterminate for a novel allele', () => {
    const r = pheno('CYP2C19', '*1/*123');
    expect(r.indeterminate).toBe(true);
  });
});

describe('phenotype engine — determinism property (plan §4.1.1)', () => {
  // Deterministic PRNG so the "property" test itself is reproducible.
  function mulberry32(seed: number): () => number {
    let a = seed;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it('same input always yields the same phenotype (1000 cases, repeated + order-swapped)', () => {
    const alleles = ['*1', '*2', '*3', '*4', '*5', '*9', '*10', '*17', '*41'];
    const rand = mulberry32(20240612);
    const loaded = loadGene('CYP2D6');

    for (let i = 0; i < 1000; i++) {
      const a = alleles[Math.floor(rand() * alleles.length)];
      const b = alleles[Math.floor(rand() * alleles.length)];

      const norm1 = normaliseDiplotype('CYP2D6', `${a}/${b}`);
      const norm2 = normaliseDiplotype('CYP2D6', `${b}/${a}`); // swapped order
      if (!norm1.ok || !norm2.ok) throw new Error('normalise failed');

      const r1 = assignPhenotype(loaded, norm1.diplotype);
      const r1again = assignPhenotype(loaded, norm1.diplotype);
      const r2 = assignPhenotype(loaded, norm2.diplotype); // order independence

      expect(r1again.phenotype).toBe(r1.phenotype);
      expect(r1again.activity_score).toBe(r1.activity_score);
      expect(r2.phenotype).toBe(r1.phenotype);
      expect(r2.activity_score).toBe(r1.activity_score);
    }
  });
});
