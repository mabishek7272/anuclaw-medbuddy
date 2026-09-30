import { describe, it, expect } from 'vitest';
import { parseVinaOutput } from './vina';
import { EngineError } from '../types';

// Representative AutoDock Vina 1.2.x scoring table.
const SAMPLE = `
AutoDock Vina v1.2.5
Computing Vina grid ... done.
Performing docking (random seed: 42) ...

mode |   affinity | dist from best mode
     | (kcal/mol) | rmsd l.b.| rmsd u.b.
-----+------------+----------+----------
   1       -7.345      0.000      0.000
   2       -6.812      1.934      2.541
   3       -6.004      2.110      3.880
`;

describe('parseVinaOutput (WS-A2, pure)', () => {
  it('extracts modes and the best affinity', () => {
    const r = parseVinaOutput(SAMPLE);
    expect(r.modes).toHaveLength(3);
    expect(r.best_affinity_kcal_mol).toBe(-7.345);
    expect(r.modes[0]).toEqual({ mode: 1, affinity_kcal_mol: -7.345, rmsd_lb: 0, rmsd_ub: 0 });
    expect(r.modes[2].affinity_kcal_mol).toBe(-6.004);
  });

  it('throws (crashed) when no modes are present', () => {
    expect(() => parseVinaOutput('error: bad receptor\n')).toThrow(EngineError);
  });
});
