import { describe, it, expect } from 'vitest';
import { ReferenceEchoEngine } from './reference-echo';
import {
  EngineRegistry,
  EngineNotValidatedError,
  UnknownEngineError,
} from './registry';
import {
  EngineAdapter,
  EngineError,
  EngineResult,
  hashEngineInput,
} from './types';

const fixedClock = () => new Date('2026-06-13T00:00:00.000Z');

describe('engine adapter contract (WS-A1)', () => {
  it('produces a structured, provenance-tagged result', async () => {
    const e = new ReferenceEchoEngine();
    const r = await e.run({ value: 'ab', repeat: 2 }, { now: fixedClock });
    expect(r.output).toEqual({ echoed: 'abab', length: 4 });
    expect(r.engine_id).toBe('reference-echo');
    expect(r.engine_version).toBe('1.0.0');
    expect(r.reproducibility_class).toBe('deterministic');
    expect(r.provenance.tool).toBe('reference-echo');
    expect(r.input_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic: same input ⇒ same input_hash and output', async () => {
    const e = new ReferenceEchoEngine();
    const a = await e.run({ value: 'x', repeat: 3 }, { now: fixedClock });
    const b = await e.run({ value: 'x', repeat: 3 }, { now: fixedClock });
    expect(b.input_hash).toBe(a.input_hash);
    expect(b.output).toEqual(a.output);
  });

  it('different input ⇒ different input_hash', async () => {
    const e = new ReferenceEchoEngine();
    const a = await e.run({ value: 'x' }, { now: fixedClock });
    const b = await e.run({ value: 'y' }, { now: fixedClock });
    expect(a.input_hash).not.toBe(b.input_hash);
  });

  it('input hash is canonical (key order independent)', () => {
    const h1 = hashEngineInput('e', '1', { a: 1, b: 2 });
    const h2 = hashEngineInput('e', '1', { b: 2, a: 1 });
    expect(h1).toBe(h2);
  });

  it('rejects invalid input with the EngineError taxonomy', async () => {
    const e = new ReferenceEchoEngine();
    await expect(e.run({ value: 123 as unknown as string })).rejects.toBeInstanceOf(EngineError);
    await expect(e.run({ value: 'x', repeat: 0 })).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('engine registry — Clinical fail-closed (WS-A3)', () => {
  /** An inline unvalidated engine (delegates to the reference engine). */
  function unvalidated(): EngineAdapter<unknown, unknown> {
    const ref = new ReferenceEchoEngine();
    return {
      id: 'echo-unvalidated',
      version: '0.0.1',
      validated: false,
      reproducibility_class: 'deterministic',
      run: (input, ctx) => ref.run(input as { value: string }, ctx) as Promise<EngineResult<unknown>>,
    };
  }

  it('registers and resolves an engine for both tiers', () => {
    const reg = new EngineRegistry();
    reg.register(new ReferenceEchoEngine());
    expect(reg.has('reference-echo')).toBe(true);
    expect(reg.forRuo('reference-echo').id).toBe('reference-echo');
    expect(reg.forClinical('reference-echo').id).toBe('reference-echo'); // validated
    expect(reg.ids()).toContain('reference-echo');
  });

  it('Clinical tier fails closed for an unvalidated engine', () => {
    const reg = new EngineRegistry();
    reg.register(unvalidated());
    // RUO allows it…
    expect(reg.forRuo('echo-unvalidated').id).toBe('echo-unvalidated');
    // …Clinical refuses it.
    expect(() => reg.forClinical('echo-unvalidated')).toThrow(EngineNotValidatedError);
  });

  it('throws on an unknown engine', () => {
    const reg = new EngineRegistry();
    expect(() => reg.get('nope')).toThrow(UnknownEngineError);
  });
});
