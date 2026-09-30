import { describe, it, expect } from 'vitest';
import { computeMolecularProperties as P, MolecularPropertiesEngine } from './properties';

describe('molecular properties (SMILES)', () => {
  it('water O → H2O', () => {
    const r = P('O');
    expect(r.formula).toBe('H2O');
    expect(r.molecular_weight).toBeCloseTo(18.015, 2);
    expect(r.heavy_atom_count).toBe(1);
  });

  it('ethanol CCO → C2H6O', () => {
    const r = P('CCO');
    expect(r.formula).toBe('C2H6O');
    expect(r.molecular_weight).toBeCloseTo(46.069, 2);
    expect(r.h_bond_donors).toBe(1); // OH
    expect(r.h_bond_acceptors).toBe(1); // O
  });

  it('benzene (Kekulé) C1=CC=CC=C1 → C6H6, one ring', () => {
    const r = P('C1=CC=CC=C1');
    expect(r.formula).toBe('C6H6');
    expect(r.molecular_weight).toBeCloseTo(78.114, 2);
    expect(r.ring_count).toBe(1);
  });

  it('benzene (aromatic) c1ccccc1 → C6H6', () => {
    expect(P('c1ccccc1').formula).toBe('C6H6');
  });

  it('aspirin CC(=O)OC1=CC=CC=C1C(=O)O → C9H8O4', () => {
    const r = P('CC(=O)OC1=CC=CC=C1C(=O)O');
    expect(r.formula).toBe('C9H8O4');
    expect(r.molecular_weight).toBeCloseTo(180.159, 1);
    expect(r.ring_count).toBe(1);
  });

  it('caffeine CN1C=NC2=C1C(=O)N(C)C(=O)N2C → C8H10N4O2', () => {
    const r = P('CN1C=NC2=C1C(=O)N(C)C(=O)N2C');
    expect(r.formula).toBe('C8H10N4O2');
    expect(r.molecular_weight).toBeCloseTo(194.19, 1);
    expect(r.ring_count).toBe(2);
  });

  it('ibuprofen → C13H18O2, no Lipinski violations', () => {
    const r = P('CC(C)CC1=CC=C(C=C1)C(C)C(=O)O');
    expect(r.formula).toBe('C13H18O2');
    expect(r.molecular_weight).toBeCloseTo(206.285, 1);
    expect(r.lipinski.violations).toBe(0);
  });

  it('engine is deterministic with stable input hash', async () => {
    const e = new MolecularPropertiesEngine();
    const a = await e.run({ smiles: 'CCO' }, { now: () => new Date(0) });
    const b = await e.run({ smiles: 'CCO' }, { now: () => new Date(0) });
    expect(a.input_hash).toBe(b.input_hash);
    expect(a.output.formula).toBe('C2H6O');
    expect(a.reproducibility_class).toBe('deterministic');
  });

  it('rejects invalid SMILES', () => {
    expect(() => P('')).toThrow();
    expect(() => P('CCXC')).toThrow();
  });
});
