/**
 * Cheminformatics — molecular properties engine (Phase 0, WS-A4, RUO).
 *
 * A REAL, deterministic SMILES → molecular-properties calculator with no
 * external dependency: parses the organic subset + bracket atoms, applies a
 * standard valence model to infer implicit hydrogens, and computes the
 * molecular formula (Hill order), average molecular weight, heavy-atom count,
 * H-bond donors/acceptors (Lipinski definitions), ring count, and a Lipinski
 * Rule-of-Five assessment.
 *
 * Exact for Kekulé SMILES (explicit bond orders); aromatic lowercase atoms use
 * a 1.5-order model that is correct for simple monocyclic aromatics. logP/TPSA
 * are NOT computed (they need atom-contribution models) — Ro5 is therefore
 * evaluated on MW/HBD/HBA only and that limitation is reported.
 */

import {
  EngineAdapter,
  EngineError,
  EngineResult,
  RunContext,
  hashEngineInput,
  nowIso,
} from '../types';

// Average atomic weights (IUPAC), sufficient for MW reporting.
const WEIGHTS: Record<string, number> = {
  H: 1.008, B: 10.811, C: 12.011, N: 14.007, O: 15.999, F: 18.998,
  P: 30.974, S: 32.06, Cl: 35.45, Br: 79.904, I: 126.904,
};
// Allowed valences (smallest satisfying the bond sum wins).
const VALENCES: Record<string, number[]> = {
  B: [3], C: [4], N: [3], O: [2], F: [1], P: [3, 5], S: [2, 4, 6], Cl: [1], Br: [1], I: [1],
};
const ORGANIC = new Set(['B', 'C', 'N', 'O', 'F', 'P', 'S', 'Cl', 'Br', 'I']);

interface Atom {
  element: string;
  aromatic: boolean;
  bracket: boolean;   // bracketed ⇒ hydrogens are explicit
  explicitH: number;
  charge: number;
  bondSum: number;    // sum of bond orders to neighbours (aromatic = 1.5)
}

const BOND_ORDER: Record<string, number> = { '-': 1, '=': 2, '#': 3, ':': 1.5, '/': 1, '\\': 1 };

/** Parse a SMILES string into atoms with accumulated bond orders. */
function parse(smiles: string): Atom[] {
  const atoms: Atom[] = [];
  const branchStack: number[] = [];
  const ringBonds = new Map<string, { atom: number; order: number }>();
  let prev = -1;
  let pendingBond = 0; // 0 = default single (or aromatic if both aromatic)
  let i = 0;

  const link = (a: number, b: number, order: number) => {
    atoms[a].bondSum += order;
    atoms[b].bondSum += order;
  };
  const defaultOrder = (a: number, b: number) =>
    atoms[a].aromatic && atoms[b].aromatic ? 1.5 : 1;

  const pushAtom = (atom: Atom) => {
    const idx = atoms.push(atom) - 1;
    if (prev !== -1) {
      const order = pendingBond || defaultOrder(prev, idx);
      link(prev, idx, order);
    }
    pendingBond = 0;
    prev = idx;
    return idx;
  };

  while (i < smiles.length) {
    const ch = smiles[i];

    if (ch === ' ') { i++; continue; }
    if (ch === '(') { branchStack.push(prev); i++; continue; }
    if (ch === ')') { prev = branchStack.pop() ?? prev; i++; continue; }
    if (ch in BOND_ORDER) { pendingBond = BOND_ORDER[ch]; i++; continue; }

    // Ring-closure digit (or %nn).
    if (/\d/.test(ch) || ch === '%') {
      let label: string;
      if (ch === '%') { label = smiles.slice(i + 1, i + 3); i += 3; }
      else { label = ch; i += 1; }
      const existing = ringBonds.get(label);
      if (existing) {
        const order = pendingBond || existing.order || defaultOrder(existing.atom, prev);
        link(existing.atom, prev, order);
        ringBonds.delete(label);
      } else {
        ringBonds.set(label, { atom: prev, order: pendingBond });
      }
      pendingBond = 0;
      continue;
    }

    // Bracket atom: [<isotope?><symbol><Hn?><charge?>]
    if (ch === '[') {
      const end = smiles.indexOf(']', i);
      if (end === -1) throw new EngineError('invalid_input', 'unterminated [ in SMILES');
      const body = smiles.slice(i + 1, end);
      const m = body.match(/^(\d*)([A-Za-z][a-z]?)(H\d*)?((?:[+-]\d*)*)/);
      if (!m) throw new EngineError('invalid_input', `bad bracket atom: [${body}]`);
      const rawSym = m[2];
      const aromatic = /^[a-z]/.test(rawSym);
      const element = rawSym.charAt(0).toUpperCase() + rawSym.slice(1);
      const explicitH = m[3] ? (m[3] === 'H' ? 1 : parseInt(m[3].slice(1), 10)) : 0;
      let charge = 0;
      if (m[4]) for (const tok of m[4].match(/[+-]\d*/g) ?? []) charge += tok[0] === '+' ? (tok.length > 1 ? +tok.slice(1) : 1) : (tok.length > 1 ? -+tok.slice(1) : -1);
      pushAtom({ element, aromatic, bracket: true, explicitH, charge, bondSum: 0 });
      i = end + 1;
      continue;
    }

    // Organic-subset atom (possibly two-letter Cl/Br); aromatic = lowercase.
    const two = smiles.slice(i, i + 2);
    let element: string | null = null;
    let aromatic = false;
    if (two === 'Cl' || two === 'Br') { element = two; i += 2; }
    else if (/[A-Z]/.test(ch)) { element = ch; i += 1; }
    else if (/[bcnops]/.test(ch)) { element = ch.toUpperCase(); aromatic = true; i += 1; }
    else { throw new EngineError('invalid_input', `unexpected character '${ch}' in SMILES`); }

    if (!ORGANIC.has(element)) throw new EngineError('invalid_input', `unsupported element '${element}'`);
    pushAtom({ element, aromatic, bracket: false, explicitH: 0, charge: 0, bondSum: 0 });
  }
  if (atoms.length === 0) throw new EngineError('invalid_input', 'empty molecule');
  return atoms;
}

function implicitH(a: Atom): number {
  if (a.bracket) return a.explicitH;
  const list = VALENCES[a.element];
  if (!list) return 0;
  const need = a.bondSum;
  for (const v of list) {
    const eff = v + Math.abs(a.charge) * 0; // charge handled only in brackets
    if (eff >= need - 1e-9) return Math.max(0, Math.round(eff - need));
  }
  return 0;
}

export interface MolPropsInput { smiles: string }
export interface MolProps {
  smiles: string;
  formula: string;
  molecular_weight: number;
  heavy_atom_count: number;
  h_bond_donors: number;
  h_bond_acceptors: number;
  ring_count: number;
  formal_charge: number;
  lipinski: { mw_ok: boolean; hbd_ok: boolean; hba_ok: boolean; violations: number; note: string };
}

const HILL = (counts: Record<string, number>): string => {
  const keys = Object.keys(counts);
  const order = keys.includes('C') ? ['C', 'H', ...keys.filter((k) => k !== 'C' && k !== 'H').sort()] : keys.sort();
  return order.filter((k) => counts[k]).map((k) => `${k}${counts[k] > 1 ? counts[k] : ''}`).join('');
};

export function computeMolecularProperties(smiles: string): MolProps {
  const s = (smiles ?? '').trim();
  if (!s) throw new EngineError('invalid_input', 'smiles is required');
  const atoms = parse(s);

  const counts: Record<string, number> = {};
  let hTotal = 0, hbd = 0, hba = 0, charge = 0;
  for (const a of atoms) {
    counts[a.element] = (counts[a.element] ?? 0) + 1;
    const h = implicitH(a);
    hTotal += h;
    charge += a.charge;
    if (a.element === 'N' || a.element === 'O') { hba += 1; hbd += h; }
  }
  counts.H = (counts.H ?? 0) + hTotal;

  let mw = 0;
  for (const [el, n] of Object.entries(counts)) mw += (WEIGHTS[el] ?? 0) * n;

  // Ring count = number of ring-closure bonds = ring-bond labels / 2.
  // (Strip bracket atoms first so isotope/charge digits aren't miscounted.)
  const ringLabelDigits = (s.replace(/\[[^\]]*\]/g, '').match(/%\d\d|\d/g) ?? []).length;
  const ring_count = Math.floor(ringLabelDigits / 2);

  const heavy = atoms.length;
  const mwR = Math.round(mw * 1000) / 1000;
  const lip = { mw_ok: mwR <= 500, hbd_ok: hbd <= 5, hba_ok: hba <= 10 };
  const violations = [lip.mw_ok, lip.hbd_ok, lip.hba_ok].filter((x) => !x).length;

  return {
    smiles: s,
    formula: HILL(counts),
    molecular_weight: mwR,
    heavy_atom_count: heavy,
    h_bond_donors: hbd,
    h_bond_acceptors: hba,
    ring_count,
    formal_charge: charge,
    lipinski: { ...lip, violations, note: 'logP/TPSA not computed; Ro5 assessed on MW/HBD/HBA only.' },
  };
}

export class MolecularPropertiesEngine implements EngineAdapter<MolPropsInput, MolProps> {
  readonly id = 'cheminformatics-properties';
  readonly version = '1.0.0';
  readonly validated = false; // RUO
  readonly reproducibility_class = 'deterministic' as const;

  async run(input: MolPropsInput, ctx?: RunContext): Promise<EngineResult<MolProps>> {
    const output = computeMolecularProperties(input?.smiles);
    const ts = nowIso(ctx?.now);
    return {
      engine_id: this.id,
      engine_version: this.version,
      input_hash: hashEngineInput(this.id, this.version, input),
      output,
      artifacts: [],
      provenance: { tool: 'anuclaw-cheminformatics', tool_version: this.version, params: {} },
      reproducibility_class: this.reproducibility_class,
      started_at: ts,
      finished_at: ts,
    };
  }
}
