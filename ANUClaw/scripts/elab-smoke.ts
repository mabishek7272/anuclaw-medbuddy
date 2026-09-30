/**
 * Runtime smoke test for the E-LAB platform router over REAL HTTP.
 * Boots an Express app with the platform router + a stub clinical-granted
 * resolver, fires requests, prints results, and exits. Verifies the wiring
 * (Express adapter → service → oncology module → per-tenant audit) at runtime.
 */
import express from 'express';
import { createElabPlatformRouter } from '../src/api/routes/elab-platform';
import { ElabDeps } from '../src/api/elab/service';
import { TenantContext } from '../src/api/elab/types';
import { EngineRegistry, JobRuntime, ReferenceEchoEngine } from '../src/engines';
import { PerTenantAuditLog } from '../src/cds';
import { OncologyCombinationModule } from '../src/cds/clinical';

const registry = new EngineRegistry();
registry.register(new ReferenceEchoEngine());
const deps: ElabDeps = {
  registry,
  jobs: new JobRuntime(registry),
  oncology: new OncologyCombinationModule(),
  audit: new PerTenantAuditLog(),
};

const resolveContext = (): TenantContext => ({
  tenant_id: 'smoke-tenant',
  scopes: ['ruo', 'clinical'],
  baa_active: true,
  allowed_clinical_domains: ['oncology-combination'],
  residency: 'us',
});

const app = express();
app.use(express.json());
app.use(createElabPlatformRouter({ deps, resolveContext }));

const HER2 = {
  tumor_type: 'breast', stage: 'II', biomarker: 'HER2+', line: 1,
  candidate_regimen: ['trastuzumab', 'pertuzumab', 'docetaxel'],
};
const ctx = (lvef: number) => ({
  organ_function: { lvef },
  allergies: { status: 'confirmed_none', items: [] },
  current_medications: { status: 'confirmed_none', items: [] },
  conditions: { status: 'confirmed_none', items: [] },
});

const PORT = 4099;
const server = app.listen(PORT, async () => {
  const base = `http://127.0.0.1:${PORT}`;
  const post = async (path: string, body: unknown) => {
    const r = await fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: (await r.json()) as Record<string, unknown> };
  };

  const rec = await post('/v1/clinical/drug-combination', { query: HER2, context: ctx(60) });
  console.log(`CLINICAL recommend → HTTP ${rec.status} · decision=${(rec.body.verdict as any)?.decision} · hash=${String((rec.body.verdict as any)?.verdict_hash).slice(0, 12)}`);

  const blk = await post('/v1/clinical/drug-combination', { query: HER2, context: ctx(40) });
  console.log(`CLINICAL low-LVEF → HTTP ${blk.status} · decision=${(blk.body.verdict as any)?.decision} · blocks=${(blk.body.verdict as any)?.blocks?.length}`);

  const ruoOk = await post('/v1/ruo/reference-echo', { input: { value: 'ab' } });
  console.log(`RUO echo → HTTP ${ruoOk.status} · tier=${ruoOk.body.tier} · regulatory="${ruoOk.body.regulatory}"`);

  const ruoDeid = await post('/v1/ruo/reference-echo', { input: { value: 'x', patient_name: 'Jane Doe' } });
  console.log(`RUO de-id reject → HTTP ${ruoDeid.status} · ${ruoDeid.body.error}`);

  const ruo404 = await post('/v1/ruo/no-such-engine', { input: { value: 'x' } });
  console.log(`RUO unknown engine → HTTP ${ruo404.status}`);

  console.log(`AUDIT entries for smoke-tenant: ${deps.audit.entries('smoke-tenant').length} · chain valid=${deps.audit.verify('smoke-tenant').valid}`);

  server.close(() => process.exit(0));
});
