/**
 * Engine validation registry (Phase 0, WS-A3).
 *
 * Engines are registered here; the Clinical tier may only use an engine whose
 * version is `validated` — otherwise the registry **fails closed**
 * (`EngineNotValidatedError`), mirroring the sealed-manifest discipline in
 * `src/cds/registry`. The RUO tier may use any registered engine (labeled
 * non-diagnostic downstream).
 */

import { EngineAdapter } from './types';

export class UnknownEngineError extends Error {
  constructor(id: string) {
    super(`No engine registered with id '${id}'`);
    this.name = 'UnknownEngineError';
  }
}

export class EngineNotValidatedError extends Error {
  constructor(id: string, version: string) {
    super(
      `Engine '${id}' version '${version}' is not validated for the Clinical tier`,
    );
    this.name = 'EngineNotValidatedError';
  }
}

export class EngineRegistry {
  private readonly engines = new Map<string, EngineAdapter<any, any>>();

  register(engine: EngineAdapter<any, any>): void {
    this.engines.set(engine.id, engine);
  }

  has(id: string): boolean {
    return this.engines.has(id);
  }

  /** Get a registered engine (any tier). Throws if unknown. */
  get(id: string): EngineAdapter<any, any> {
    const engine = this.engines.get(id);
    if (!engine) throw new UnknownEngineError(id);
    return engine;
  }

  /** RUO tier: any registered engine. */
  forRuo(id: string): EngineAdapter<any, any> {
    return this.get(id);
  }

  /** Clinical tier: fail-closed unless the engine version is validated. */
  forClinical(id: string): EngineAdapter<any, any> {
    const engine = this.get(id);
    if (!engine.validated) {
      throw new EngineNotValidatedError(engine.id, engine.version);
    }
    return engine;
  }

  ids(): string[] {
    return [...this.engines.keys()];
  }
}
