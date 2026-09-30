import { describe, it, expect } from 'vitest';
import { runPipeline } from '../pipeline';
import { makeSnapshot, med, allergy, condition, fixedClock } from './test-helpers';

const run = (snapshot: ReturnType<typeof makeSnapshot>, gene: string) =>
  runPipeline({ snapshot, gene, now: fixedClock });

describe('pipeline — safe path', () => {
  it('CYP2D6 *1/*1 + codeine, clean patient -> recommend, high confidence', () => {
    const { verdict, trace } = run(makeSnapshot(), 'CYP2D6');
    expect(verdict.decision).toBe('recommend');
    expect(verdict.confidence).toBe('high');
    expect(verdict.recommendation?.recommendation).toMatch(/label-recommended/i);
    expect(trace.at(-1)?.event).toBe('arbitration.completed');
  });

  it('attaches grounded evidence and records evidence.retrieved in the trace', () => {
    const { verdict, trace } = run(makeSnapshot(), 'CYP2D6');
    expect(verdict.evidence).not.toBeNull();
    expect(verdict.evidence?.confidence_level).toBe('High');
    expect(verdict.evidence?.evidence_used.length).toBeGreaterThan(0);
    expect(trace.some((t) => t.event === 'evidence.retrieved' && t.status === 'grounded')).toBe(true);
    expect(verdict.engine_versions['evidence']).toMatch(/2024\.1:[a-f0-9]{64}/);
  });
});

describe('pipeline — hazard test set (plan §8.4): zero unsafe output', () => {
  it('documented allergy BLOCKS even when phenotype would recommend', () => {
    const { verdict } = run(
      makeSnapshot({
        prescribed_drug: med('codeine'),
        allergies: { status: 'provided', items: [allergy('codeine')] },
      }),
      'CYP2D6',
    );
    expect(verdict.decision).toBe('block');
    expect(verdict.reason_code).toBe('safety_block');
    expect(verdict.recommendation).toBeNull(); // recommendation suppressed
    expect(verdict.blocks.some((b) => b.engine === 'allergy')).toBe(true);
  });

  it('absolute contraindication BLOCKS clopidogrel', () => {
    const { verdict } = run(
      makeSnapshot({
        prescribed_drug: med('clopidogrel'),
        genotypes: [{ gene: 'CYP2C19', diplotype: '*2/*2' }],
        conditions: {
          status: 'provided',
          items: [condition('active_pathological_bleeding')],
        },
      }),
      'CYP2C19',
    );
    expect(verdict.decision).toBe('block');
    expect(verdict.blocks.some((b) => b.engine === 'contraindication')).toBe(true);
  });

  it('contraindicated interaction BLOCKS escitalopram + MAOI', () => {
    const { verdict } = run(
      makeSnapshot({
        prescribed_drug: med('escitalopram'),
        genotypes: [{ gene: 'CYP2C19', diplotype: '*1/*1' }],
        active_medications: { status: 'provided', items: [med('phenelzine')] },
      }),
      'CYP2C19',
    );
    expect(verdict.decision).toBe('block');
    expect(verdict.blocks.some((b) => b.engine === 'interaction')).toBe(true);
  });

  it('a hard safety BLOCK outranks an indeterminate phenotype', () => {
    const { verdict } = run(
      makeSnapshot({
        prescribed_drug: med('codeine'),
        genotypes: [{ gene: 'CYP2D6', diplotype: '*1/*999' }], // novel allele
        allergies: { status: 'provided', items: [allergy('codeine')] },
      }),
      'CYP2D6',
    );
    expect(verdict.decision).toBe('block');
  });
});

describe('pipeline — cannot advise', () => {
  it('missing data (unknown med list) -> cannot_advise, no decision-core run', () => {
    const { verdict, trace } = run(
      makeSnapshot({ active_medications: { status: 'unknown', items: [] } }),
      'CYP2D6',
    );
    expect(verdict.decision).toBe('cannot_advise');
    expect(verdict.reason_code).toBe('missing_data');
    // Short-circuited before phenotype assignment.
    expect(trace.some((t) => t.event === 'phenotype.assigned')).toBe(false);
  });

  it('indeterminate phenotype (novel allele) -> cannot_advise', () => {
    const { verdict } = run(
      makeSnapshot({ genotypes: [{ gene: 'CYP2D6', diplotype: '*1/*999' }] }),
      'CYP2D6',
    );
    expect(verdict.decision).toBe('cannot_advise');
    expect(verdict.reason_code).toBe('indeterminate_phenotype');
  });
});

describe('pipeline — warnings & confidence', () => {
  it('major interaction lowers confidence but still recommends', () => {
    const { verdict } = run(
      makeSnapshot({
        prescribed_drug: med('clopidogrel'),
        genotypes: [{ gene: 'CYP2C19', diplotype: '*1/*1' }],
        active_medications: { status: 'provided', items: [med('omeprazole')] },
      }),
      'CYP2C19',
    );
    expect(verdict.decision).toBe('recommend');
    expect(verdict.confidence).toBe('reduced');
    expect(verdict.warnings.some((w) => w.engine === 'interaction')).toBe(true);
  });

  it('phenotype known but no guideline for drug -> no_guideline', () => {
    const { verdict } = run(
      makeSnapshot({ prescribed_drug: med('warfarin') }),
      'CYP2D6',
    );
    expect(verdict.decision).toBe('no_guideline');
  });
});

describe('pipeline — verdict reproducibility (plan §5.4)', () => {
  it('verdict_hash is deterministic and excludes the timestamp', () => {
    const snap = makeSnapshot();
    const a = runPipeline({ snapshot: snap, gene: 'CYP2D6', now: () => new Date('2026-01-01T00:00:00Z') });
    const b = runPipeline({ snapshot: snap, gene: 'CYP2D6', now: () => new Date('2030-12-31T23:59:59Z') });
    expect(a.verdict.verdict_hash).toBe(b.verdict.verdict_hash); // hash stable across clocks
    expect(a.verdict.timestamp).not.toBe(b.verdict.timestamp); // timestamp differs
    expect(a.verdict.verdict_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('emits an arbitration.completed audit event carrying the verdict hash', () => {
    const { verdict } = run(makeSnapshot(), 'CYP2D6');
    expect(verdict.audit_event.type).toBe('arbitration.completed');
    expect(verdict.audit_event.verdict_hash).toBe(verdict.verdict_hash);
    expect(verdict.engine_versions['phenotype']).toMatch(/2024\.1:[a-f0-9]{64}/);
  });
});
