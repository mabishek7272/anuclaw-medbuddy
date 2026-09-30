/**
 * Multi-scale simulation — one-compartment PK/PD engine (Phase 0, WS-A3).
 *
 * A REAL, deterministic pharmacokinetic simulator: closed-form one-compartment
 * model with first-order elimination and (for oral dosing) first-order
 * absorption, with multiple doses by superposition. No randomness, no LLM, no
 * external tool — same input + version ⇒ identical output (reproducibility
 * class `deterministic`). Implements the standard `EngineAdapter` contract so it
 * runs through the same guarded gateway as docking.
 *
 * Pharmacology is exact within the model assumptions; it is NOT a validated
 * clinical dosing tool — RUO / internal demonstration only.
 */

import {
  EngineAdapter,
  EngineError,
  EngineResult,
  RunContext,
  hashEngineInput,
  nowIso,
} from '../types';

export type PkRoute = 'oral' | 'iv';

export interface PkPdInput {
  route: PkRoute;
  dose_mg: number;
  /** Clearance (L/h). */
  clearance_l_h: number;
  /** Volume of distribution (L). */
  volume_l: number;
  /** First-order absorption rate (1/h) — oral only. Default 1.0. */
  ka_per_h?: number;
  /** Oral bioavailability fraction 0–1. Default 1 (and forced to 1 for IV). */
  bioavailability?: number;
  /** Dosing interval (h). Default 24. */
  interval_h?: number;
  /** Number of doses. Default 1. */
  n_doses?: number;
  /** Simulation horizon (h). Default covers all doses + ~2 half-lives. */
  duration_h?: number;
  /** Sampling step (h). Default 0.25. */
  step_h?: number;
}

export interface PkPoint {
  t_h: number;
  conc_mg_l: number;
}

export interface PkPdResult {
  /** Concentration–time series. */
  series: PkPoint[];
  ke_per_h: number;
  half_life_h: number;
  cmax_mg_l: number;
  tmax_h: number;
  cmin_mg_l: number;
  /** Trapezoidal AUC over the simulated horizon (mg·h/L). */
  auc_0_t_mg_h_l: number;
  /** Analytic AUC∞ for the total dose given (F·Dose/CL), mg·h/L. */
  auc_inf_mg_h_l: number;
}

const round = (v: number, dp = 4): number => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

function req(name: string, v: number): void {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
    throw new EngineError('invalid_input', `${name} must be a positive finite number`);
  }
}

/** Pure deterministic simulation — exported for direct use and testing. */
export function simulatePkPd(input: PkPdInput): PkPdResult {
  if (!input || (input.route !== 'oral' && input.route !== 'iv')) {
    throw new EngineError('invalid_input', "route must be 'oral' or 'iv'");
  }
  req('dose_mg', input.dose_mg);
  req('clearance_l_h', input.clearance_l_h);
  req('volume_l', input.volume_l);

  const ke = input.clearance_l_h / input.volume_l; // 1/h
  const F = input.route === 'iv' ? 1 : Math.min(Math.max(input.bioavailability ?? 1, 0), 1);
  const ka = input.route === 'oral' ? (input.ka_per_h ?? 1.0) : 0;
  if (input.route === 'oral') req('ka_per_h', ka);

  const interval = input.interval_h ?? 24;
  const nDoses = Math.max(1, Math.floor(input.n_doses ?? 1));
  const step = input.step_h ?? 0.25;
  req('interval_h', interval);
  req('step_h', step);
  const halfLife = Math.LN2 / ke;
  const duration = input.duration_h ?? (nDoses - 1) * interval + Math.max(2 * halfLife, interval);

  // Single-dose concentration at elapsed time τ (τ < 0 ⇒ dose not yet given).
  const single = (tau: number): number => {
    if (tau < 0) return 0;
    if (input.route === 'iv') {
      return (input.dose_mg / input.volume_l) * Math.exp(-ke * tau);
    }
    const coeff = (F * input.dose_mg) / input.volume_l;
    if (Math.abs(ka - ke) < 1e-9) {
      // flip-flop limit (ka ≈ ke)
      return coeff * ke * tau * Math.exp(-ke * tau);
    }
    return coeff * (ka / (ka - ke)) * (Math.exp(-ke * tau) - Math.exp(-ka * tau));
  };

  const series: PkPoint[] = [];
  let cmax = 0;
  let tmax = 0;
  for (let t = 0; t <= duration + 1e-9; t += step) {
    let c = 0;
    for (let i = 0; i < nDoses; i++) c += single(t - i * interval);
    const point = { t_h: round(t, 3), conc_mg_l: round(c) };
    series.push(point);
    if (c > cmax) { cmax = c; tmax = t; }
  }

  // Trapezoidal AUC over the horizon.
  let auc = 0;
  for (let i = 1; i < series.length; i++) {
    const dt = series[i].t_h - series[i - 1].t_h;
    auc += ((series[i].conc_mg_l + series[i - 1].conc_mg_l) / 2) * dt;
  }

  // Trough: minimum concentration in the final dosing interval (steady-state-ish).
  const tailStart = (nDoses - 1) * interval;
  const tail = series.filter((p) => p.t_h >= tailStart);
  const cmin = tail.length ? Math.min(...tail.map((p) => p.conc_mg_l)) : 0;

  return {
    series,
    ke_per_h: round(ke),
    half_life_h: round(halfLife),
    cmax_mg_l: round(cmax),
    tmax_h: round(tmax, 3),
    cmin_mg_l: round(cmin),
    auc_0_t_mg_h_l: round(auc),
    auc_inf_mg_h_l: round((F * input.dose_mg * nDoses) / input.clearance_l_h),
  };
}

export class PkPdSimulationEngine implements EngineAdapter<PkPdInput, PkPdResult> {
  readonly id = 'pkpd-onecompartment';
  readonly version = '1.0.0';
  /** RUO simulation — fail-closed for the Clinical tier (not a validated tool). */
  readonly validated = false;
  readonly reproducibility_class = 'deterministic' as const;

  async run(input: PkPdInput, ctx?: RunContext): Promise<EngineResult<PkPdResult>> {
    const output = simulatePkPd(input);
    const ts = nowIso(ctx?.now);
    return {
      engine_id: this.id,
      engine_version: this.version,
      input_hash: hashEngineInput(this.id, this.version, input),
      output,
      artifacts: [],
      provenance: {
        tool: 'anuclaw-pkpd',
        tool_version: this.version,
        params: { route: input.route, n_doses: input.n_doses ?? 1, interval_h: input.interval_h ?? 24 },
      },
      reproducibility_class: this.reproducibility_class,
      started_at: ts,
      finished_at: ts,
    };
  }
}
