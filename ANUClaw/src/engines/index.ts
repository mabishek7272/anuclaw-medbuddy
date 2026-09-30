/**
 * ANUClaw E-LAB — Engine layer (Phase 0).
 *
 * Typed, version-pinned, deterministic engine adapters + a validation registry
 * that fails closed for the Clinical tier. No LLM/agent in this layer.
 */

export * from './types';
export {
  EngineRegistry,
  UnknownEngineError,
  EngineNotValidatedError,
} from './registry';
export { ReferenceEchoEngine } from './reference-echo';
export type { EchoInput, EchoOutput } from './reference-echo';

// ── Async job runtime (WS-B) ───────────────────────────────────────────────────
export * from './jobs/types';
export { cacheKey, InMemoryResultCache } from './jobs/cache';
export { JobRuntime, InMemoryJobStore } from './jobs/runtime';
export type { JobRuntimeOptions } from './jobs/runtime';

// ── Simulation engine (WS-A3, real: one-compartment PK/PD, deterministic) ──────
export { PkPdSimulationEngine, simulatePkPd } from './simulation/pkpd';
export type { PkPdInput, PkPdResult, PkPoint, PkRoute } from './simulation/pkpd';

// ── Cheminformatics engine (WS-A4, real: SMILES → properties, deterministic) ───
export { MolecularPropertiesEngine, computeMolecularProperties } from './cheminformatics/properties';
export type { MolPropsInput, MolProps } from './cheminformatics/properties';

// ── Structure lookup engine (WS-A5, AlphaFold DB, snapshot_only_external) ───────
export { AlphaFoldStructureEngine } from './structure/alphafold';
export type { StructureInput, StructureResult } from './structure/alphafold';

// ── Docking engine (WS-A2, real: AutoDock Vina) ────────────────────────────────
export { VinaDockingEngine, parseVinaOutput } from './docking/vina';
export type {
  DockingInput,
  DockingResult,
  DockingMode,
  DockingBox,
  VinaEngineOptions,
} from './docking/vina';
