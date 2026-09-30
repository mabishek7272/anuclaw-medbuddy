import { describe, it, expect } from 'vitest';
import {
  ElabDeps,
  runClinicalDrugCombination,
  runRuo,
} from './service';
import { TenantContext } from './types';
import { checkRuoInput } from './de-id';
import { EngineRegistry, JobRuntime, ReferenceEchoEngine } from '../../engines';
import { PerTenantAuditLog, SinkFactory } from '../../cds';
import {
  OncologyCombinationModule,
  OncologyContext,
  OncologyQuery,
} from '../../cds/clinical';

function makeDeps(sinkFactory?: SinkFactory): ElabDeps {
  const registry = new EngineRegistry();
  registry.register(new ReferenceEchoEngine());
  return {
    registry,
    jobs: new JobRuntime(registry, { defaultTimeoutMs: 1000 }),
    oncology: new OncologyCombinationModule(),
    audit: new PerTenantAuditLog(sinkFactory),
  };
}

const ruoCtx: TenantContext = {
  tenant_id: 't1',
  scopes: ['ruo'],
  baa_active: false,
  allowed_clinical_domains: [],
  residency: 'us',
};

const clinicalCtx: TenantContext = {
  tenant_id: 'tc',
  scopes: ['clinical'],
  baa_active: true,
  allowed_clinical_domains: ['oncology-combination'],
  residency: 'us',
};

const HER2: OncologyQuery = {
  tumor_type: 'breast',
  stage: 'II',
  biomarker: 'HER2+',
  line: 1,
  candidate_regimen: ['trastuzumab', 'pertuzumab', 'docetaxel'],
};
const cleanContext: OncologyContext = {
  organ_function: { lvef: 60 },
  allergies: { status: 'confirmed_none', items: [] },
  current_medications: { status: 'confirmed_none', items: [] },
  conditions: { status: 'confirmed_none', items: [] },
};

describe('RUO de-id gate (#6 / Spec 5)', () => {
  it('passes de-identified input and rejects identifiers/genomics', () => {
    expect(checkRuoInput({ value: 'x' }).ok).toBe(true);
    expect(checkRuoInput({ patient_name: 'John Doe' }).ok).toBe(false);
    expect(checkRuoInput({ ligand: 'CCO', mrn: '123' }).ok).toBe(false);
    expect(checkRuoInput({ variants: [1, 2, 3, 4, 5, 6] }).ok).toBe(false);
    expect(checkRuoInput({ vcf: '…' }).ok).toBe(false);
  });
});

describe('RUO endpoint (WS-D)', () => {
  it('runs a de-identified job and records it per tenant', async () => {
    const deps = makeDeps();
    const out = await runRuo(deps, ruoCtx, { engineId: 'reference-echo', input: { value: 'ab' } });
    expect(out.status).toBe(200);
    expect((out.body as { tier: string }).tier).toBe('ruo');
    expect((out.body as { regulatory: string }).regulatory).toMatch(/not for diagnostic/i);
    expect(deps.audit.entries('t1').some((e) => e.event_type === 'ruo.run')).toBe(true);
  });

  it('rejects non-de-identified input (400)', async () => {
    const deps = makeDeps();
    const out = await runRuo(deps, ruoCtx, { engineId: 'reference-echo', input: { value: 'x', patient_name: 'J' } });
    expect(out.status).toBe(400);
  });

  it('denies a tenant without the ruo scope (403)', async () => {
    const deps = makeDeps();
    const out = await runRuo(deps, { ...ruoCtx, scopes: [] }, { engineId: 'reference-echo', input: { value: 'x' } });
    expect(out.status).toBe(403);
  });

  it('404 for an unknown engine', async () => {
    const deps = makeDeps();
    const out = await runRuo(deps, ruoCtx, { engineId: 'nope', input: { value: 'x' } });
    expect(out.status).toBe(404);
  });
});

describe('Clinical drug-combination endpoint (WS-D + C4 gate)', () => {
  it('returns a guarded recommend verdict and audits it per tenant', () => {
    const deps = makeDeps();
    const out = runClinicalDrugCombination(deps, clinicalCtx, { query: HER2, context: cleanContext });
    expect(out.status).toBe(200);
    const body = out.body as { tier: string; verdict: { decision: string; verdict_hash: string } };
    expect(body.tier).toBe('clinical');
    expect(body.verdict.decision).toBe('recommend');
    expect(deps.audit.entries('tc').some((e) => e.event_type === 'verdict.recorded')).toBe(true);
  });

  it('returns a block verdict for a safety contraindication', () => {
    const deps = makeDeps();
    const out = runClinicalDrugCombination(deps, clinicalCtx, {
      query: HER2,
      context: { ...cleanContext, organ_function: { lvef: 40 } },
    });
    expect(out.status).toBe(200);
    expect((out.body as { verdict: { decision: string } }).verdict.decision).toBe('block');
  });

  it('clinical gate fails closed: no BAA / wrong domain / no scope ⇒ 403', () => {
    const deps = makeDeps();
    expect(runClinicalDrugCombination(deps, { ...clinicalCtx, baa_active: false }, { query: HER2, context: cleanContext }).status).toBe(403);
    expect(runClinicalDrugCombination(deps, { ...clinicalCtx, allowed_clinical_domains: [] }, { query: HER2, context: cleanContext }).status).toBe(403);
    expect(runClinicalDrugCombination(deps, { ...clinicalCtx, scopes: ['ruo'] }, { query: HER2, context: cleanContext }).status).toBe(403);
  });

  it('completeness: audit-write failure ⇒ 500 and NO verdict (fail-closed)', () => {
    const failing: SinkFactory = () => ({
      append: () => {
        throw new Error('audit down');
      },
      all: () => [],
      head: () => null,
    });
    const deps = makeDeps(failing);
    const out = runClinicalDrugCombination(deps, clinicalCtx, { query: HER2, context: cleanContext });
    expect(out.status).toBe(500);
    expect((out.body as { verdict?: unknown }).verdict).toBeUndefined();
  });
});
