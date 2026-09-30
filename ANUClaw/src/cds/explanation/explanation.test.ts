import { describe, it, expect } from 'vitest';
import { runPipeline, runPipelineWithExplanation } from '../pipeline';
import { makeSnapshot, med, allergy } from '../safety/test-helpers';
import { generateExplanation } from './explanation-service';
import { checkConsistency } from './consistency-guard';
import { renderTemplate, deterministicTemplateProvider } from './template-provider';
import {
  ExplanationContext,
  ExplanationProvider,
  NarrativeDraft,
} from './types';

// ── Build real verdicts via the pipeline ──────────────────────────────────────

function verdictFor(
  snapshot: ReturnType<typeof makeSnapshot>,
  gene: string,
) {
  return runPipeline({ snapshot, gene }).verdict;
}

const recommendV = verdictFor(makeSnapshot(), 'CYP2D6'); // codeine NM -> use
const recommendAvoidV = verdictFor(
  makeSnapshot({
    prescribed_drug: med('clopidogrel'),
    genotypes: [{ gene: 'CYP2C19', diplotype: '*2/*2' }],
  }),
  'CYP2C19',
); // clopidogrel PM -> avoid
const blockV = verdictFor(
  makeSnapshot({
    prescribed_drug: med('codeine'),
    allergies: { status: 'provided', items: [allergy('codeine')] },
  }),
  'CYP2D6',
);
const cannotAdviseV = verdictFor(
  makeSnapshot({ active_medications: { status: 'unknown', items: [] } }),
  'CYP2D6',
);
const noGuidelineV = verdictFor(makeSnapshot({ prescribed_drug: med('warfarin') }), 'CYP2D6');

const ctx = (drug: string, gene = 'CYP2D6'): ExplanationContext => ({ gene, drug });

// ── Template provider is faithful by construction ─────────────────────────────

describe('deterministic template passes the consistency guard for every decision', () => {
  const cases: Array<[string, ReturnType<typeof verdictFor>, ExplanationContext]> = [
    ['recommend(use)', recommendV, ctx('codeine')],
    ['recommend(avoid)', recommendAvoidV, ctx('clopidogrel', 'CYP2C19')],
    ['block', blockV, ctx('codeine')],
    ['cannot_advise', cannotAdviseV, ctx('codeine')],
    ['no_guideline', noGuidelineV, ctx('warfarin')],
  ];

  it.each(cases)('%s', async (_name, verdict, context) => {
    const r = await generateExplanation(verdict, context);
    expect(r.status).toBe('template');
    expect(r.narrative).not.toBeNull();
    expect(r.consistency.consistent).toBe(true);
    expect(r.escalate_to_human).toBe(false);
  });
});

// ── Consistency guard catches contradictions ──────────────────────────────────

describe('consistency guard (plan §2.2, stage 14)', () => {
  it('flags a narrative that endorses a BLOCKED drug', () => {
    const bad: NarrativeDraft = {
      prose: 'Use the standard dose of codeine as prescribed; this is recommended.',
      assertions: { decision: 'recommend', drug: 'codeine', directive: 'use' },
    };
    const r = checkConsistency(blockV, ctx('codeine'), bad);
    expect(r.consistent).toBe(false);
    expect(r.violations.some((v) => /decision mismatch/.test(v))).toBe(true);
    expect(r.violations.some((v) => /endorsement/.test(v))).toBe(true);
  });

  it('flags correct assertions but contradictory prose (block endorsed in text)', () => {
    const bad: NarrativeDraft = {
      prose: 'Codeine is recommended; it is safe to use at the standard dose.',
      assertions: { decision: 'block', drug: 'codeine', directive: 'avoid' },
    };
    const r = checkConsistency(blockV, ctx('codeine'), bad);
    expect(r.consistent).toBe(false);
    expect(r.violations.some((v) => /endorsement/.test(v))).toBe(true);
  });

  it('flags a dosing directive when the verdict is cannot_advise', () => {
    const bad: NarrativeDraft = {
      prose: 'For codeine, use as prescribed at the standard starting dose.',
      assertions: { decision: 'cannot_advise', drug: 'codeine', directive: 'none' },
    };
    const r = checkConsistency(cannotAdviseV, ctx('codeine'), bad);
    expect(r.consistent).toBe(false);
  });

  it('flags a drug mismatch', () => {
    const bad: NarrativeDraft = {
      ...renderTemplate(recommendV, ctx('codeine')),
      assertions: { decision: 'recommend', drug: 'morphine', directive: 'use' },
    };
    const r = checkConsistency(recommendV, ctx('codeine'), bad);
    expect(r.consistent).toBe(false);
    expect(r.violations.some((v) => /drug mismatch/.test(v))).toBe(true);
  });
});

// ── Injected-provider behaviour: recover, escalate, fall back ──────────────────

const goodLlm: ExplanationProvider = {
  name: 'good-llm',
  generate: ({ verdict, context }) => renderTemplate(verdict, context),
};

function contradictoryDraft(context: ExplanationContext): NarrativeDraft {
  return {
    prose: `Use the standard dose of ${context.drug} as prescribed; this is recommended.`,
    assertions: { decision: 'recommend', drug: context.drug, directive: 'use' },
  };
}

describe('explanation service — provider orchestration (plan §3.2, §3.3)', () => {
  it('uses a faithful LLM narrative (status llm)', async () => {
    const r = await generateExplanation(blockV, ctx('codeine'), { provider: goodLlm });
    expect(r.status).toBe('llm');
    expect(r.consistency.consistent).toBe(true);
  });

  it('regenerates after a contradiction and recovers (attempt 2)', async () => {
    let n = 0;
    const flaky: ExplanationProvider = {
      name: 'flaky-llm',
      generate: ({ verdict, context }) => {
        n += 1;
        return n === 1 ? contradictoryDraft(context) : renderTemplate(verdict, context);
      },
    };
    const r = await generateExplanation(blockV, ctx('codeine'), { provider: flaky });
    expect(r.status).toBe('llm');
    expect(r.attempts).toBe(2);
    expect(r.consistency.consistent).toBe(true);
  });

  it('escalates to a human with NO narrative after N consistency failures', async () => {
    const bad: ExplanationProvider = {
      name: 'bad-llm',
      generate: ({ context }) => contradictoryDraft(context),
    };
    const r = await generateExplanation(blockV, ctx('codeine'), {
      provider: bad,
      maxAttempts: 3,
    });
    expect(r.status).toBe('escalated');
    expect(r.narrative).toBeNull();
    expect(r.escalate_to_human).toBe(true);
    expect(r.attempts).toBe(3);
    // The deterministic decision is untouched regardless of the narrative.
    expect(blockV.decision).toBe('block');
    const failures = r.audit_events.filter(
      (e) => e.type === 'consistency.verified' && e.status === 'fail',
    );
    expect(failures.length).toBe(3);
  });

  it('falls back to a flagged template when the provider is unavailable', async () => {
    const broken: ExplanationProvider = {
      name: 'broken-llm',
      generate: () => {
        throw new Error('LLM service unavailable');
      },
    };
    const r = await generateExplanation(recommendV, ctx('codeine'), { provider: broken });
    expect(r.status).toBe('template_fallback');
    expect(r.narrative).not.toBeNull();
    expect(r.flagged).toBe(true);
    expect(r.consistency.consistent).toBe(true);
  });
});

// ── Full pipeline stages 4–14 ─────────────────────────────────────────────────

describe('runPipelineWithExplanation (stages 4–14)', () => {
  it('produces a verdict and a guard-passed explanation, with stage 13/14 trace', async () => {
    const r = await runPipelineWithExplanation({ snapshot: makeSnapshot(), gene: 'CYP2D6' });
    expect(r.verdict.decision).toBe('recommend');
    expect(r.explanation.status).toBe('template');
    expect(r.explanation.narrative).toMatch(/codeine/i);
    expect(r.trace.some((t) => t.event === 'explanation.generated')).toBe(true);
    expect(r.trace.some((t) => t.event === 'consistency.verified' && t.status === 'pass')).toBe(true);
  });

  it('a block verdict yields a block narrative that never endorses the drug', async () => {
    const r = await runPipelineWithExplanation({
      snapshot: makeSnapshot({
        prescribed_drug: med('codeine'),
        allergies: { status: 'provided', items: [allergy('codeine')] },
      }),
      gene: 'CYP2D6',
      explanationProvider: goodLlm,
    });
    expect(r.verdict.decision).toBe('block');
    expect(r.explanation.consistency.consistent).toBe(true);
    expect(r.explanation.narrative).toMatch(/do not|avoid|blocked/i);
  });
});
