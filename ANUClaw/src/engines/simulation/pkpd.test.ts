import { describe, it, expect } from 'vitest';
import { simulatePkPd, PkPdSimulationEngine } from './pkpd';

describe('PK/PD one-compartment simulator', () => {
  it('IV bolus: C(0)=Dose/V and AUC∞≈Dose/CL', () => {
    const r = simulatePkPd({ route: 'iv', dose_mg: 100, clearance_l_h: 5, volume_l: 50, step_h: 0.05 });
    expect(r.series[0].conc_mg_l).toBeCloseTo(100 / 50, 3); // 2.0 mg/L
    expect(r.ke_per_h).toBeCloseTo(0.1, 4); // CL/V
    expect(r.auc_inf_mg_h_l).toBeCloseTo(100 / 5, 3); // 20
    // Trapezoidal AUC over a long horizon approaches AUC∞.
    expect(r.auc_0_t_mg_h_l).toBeGreaterThan(0.9 * r.auc_inf_mg_h_l);
  });

  it('half-life follows ln2/ke', () => {
    const r = simulatePkPd({ route: 'iv', dose_mg: 10, clearance_l_h: 1, volume_l: 10 });
    expect(r.half_life_h).toBeCloseTo(Math.LN2 / 0.1, 2); // ke=0.1 → ~6.93 h
  });

  it('oral: concentration rises from 0 to a peak then falls', () => {
    const r = simulatePkPd({ route: 'oral', dose_mg: 100, clearance_l_h: 5, volume_l: 50, ka_per_h: 1, step_h: 0.1 });
    expect(r.series[0].conc_mg_l).toBe(0); // nothing absorbed at t=0
    expect(r.cmax_mg_l).toBeGreaterThan(0);
    expect(r.tmax_h).toBeGreaterThan(0); // peak after t=0
  });

  it('multiple doses accumulate (steady-state Cmax > single-dose Cmax)', () => {
    const base = { route: 'iv' as const, dose_mg: 100, clearance_l_h: 5, volume_l: 50, interval_h: 6 };
    const single = simulatePkPd({ ...base, n_doses: 1 });
    const multi = simulatePkPd({ ...base, n_doses: 5 });
    expect(multi.cmax_mg_l).toBeGreaterThan(single.cmax_mg_l);
    expect(multi.cmin_mg_l).toBeGreaterThan(0);
  });

  it('is deterministic — identical input ⇒ identical engine output + hash', async () => {
    const eng = new PkPdSimulationEngine();
    const input = { route: 'oral' as const, dose_mg: 250, clearance_l_h: 7, volume_l: 35, ka_per_h: 1.2, n_doses: 3, interval_h: 8 };
    const a = await eng.run(input, { now: () => new Date(0) });
    const b = await eng.run(input, { now: () => new Date(0) });
    expect(a.input_hash).toBe(b.input_hash);
    expect(JSON.stringify(a.output)).toBe(JSON.stringify(b.output));
    expect(a.reproducibility_class).toBe('deterministic');
    expect(eng.validated).toBe(false); // RUO; Clinical fail-closed
  });

  it('rejects invalid input', () => {
    expect(() => simulatePkPd({ route: 'iv', dose_mg: 0, clearance_l_h: 5, volume_l: 50 })).toThrow();
    expect(() => simulatePkPd({ route: 'xyz' as any, dose_mg: 1, clearance_l_h: 1, volume_l: 1 })).toThrow();
    expect(() => simulatePkPd({ route: 'iv', dose_mg: 1, clearance_l_h: -1, volume_l: 1 })).toThrow();
  });
});
