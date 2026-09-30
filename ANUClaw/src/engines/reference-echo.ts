/**
 * Reference deterministic engine (Phase 0, WS-A1).
 *
 * Not a scientific engine — a tiny, dependency-free adapter that exercises and
 * proves the `EngineAdapter` contract (determinism, canonical input hashing,
 * provenance, error taxonomy) without needing a container/tool. Real engines
 * (Vina docking, PK/PD ODE, …) implement the same contract.
 */

import {
  EngineAdapter,
  EngineError,
  EngineResult,
  RunContext,
  hashEngineInput,
  nowIso,
} from './types';

export interface EchoInput {
  value: string;
  repeat?: number;
}

export interface EchoOutput {
  echoed: string;
  length: number;
}

export class ReferenceEchoEngine implements EngineAdapter<EchoInput, EchoOutput> {
  readonly id = 'reference-echo';
  readonly version = '1.0.0';
  readonly validated = true;
  readonly reproducibility_class = 'deterministic' as const;

  async run(input: EchoInput, ctx?: RunContext): Promise<EngineResult<EchoOutput>> {
    if (!input || typeof input.value !== 'string') {
      throw new EngineError('invalid_input', 'EchoInput.value must be a string');
    }
    const repeat = input.repeat ?? 1;
    if (!Number.isInteger(repeat) || repeat < 1) {
      throw new EngineError('invalid_input', 'EchoInput.repeat must be a positive integer');
    }

    const echoed = input.value.repeat(repeat);
    const ts = nowIso(ctx?.now);

    return {
      engine_id: this.id,
      engine_version: this.version,
      input_hash: hashEngineInput(this.id, this.version, input),
      output: { echoed, length: echoed.length },
      artifacts: [],
      provenance: {
        tool: 'reference-echo',
        tool_version: this.version,
        params: { repeat },
      },
      reproducibility_class: this.reproducibility_class,
      started_at: ts,
      finished_at: ts,
    };
  }
}
