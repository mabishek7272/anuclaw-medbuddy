/**
 * ANUClaw E-LAB demo server — one command, zero infra.
 *
 *   npm run elab:demo   →   http://localhost:4099/v1/elab
 *
 * In-memory (no Postgres), no messaging channels, stub auth that grants both
 * tiers — so the whole platform is clickable for internal testing:
 *   • Drug Combination (Clinical): recommend / block / cannot_advise verdicts
 *   • Engines (RUO): one-click real AutoDock Vina docking (needs Docker)
 *
 * Seed/illustrative clinical content — internal demonstration only, not for care.
 */
import express from 'express';
import { createElabUiRouter } from '../src/api/routes/elab-ui';
import { createElabPlatformRouter } from '../src/api/routes/elab-platform';
import { createDefaultElabPlatform } from '../src/api/elab/platform';
import { TenantContext } from '../src/api/elab/types';

const deps = createDefaultElabPlatform(); // registry incl. Vina + in-memory per-tenant audit
const demoResolver = (): TenantContext => ({
  tenant_id: 'demo-tenant',
  scopes: ['ruo', 'clinical'],
  baa_active: true,
  allowed_clinical_domains: ['oncology-combination'],
  residency: 'us',
});

const app = express();
app.use(express.json({ limit: '10mb' }));
// Authed platform endpoints (stub resolver grants both tiers for the demo).
app.use(createElabPlatformRouter({ deps, resolveContext: demoResolver }));
// Console UI + public demo endpoints (clinical + dock-from-SMILES).
app.use(createElabUiRouter(deps));
app.get('/', (_req, res) => res.redirect('/v1/elab'));

const PORT = process.env.PORT ? Number(process.env.PORT) : 4099;
app.listen(PORT, () => {
  /* eslint-disable no-console */
  console.log('');
  console.log('  ANUClaw E-LAB demo  ·  in-memory · no Postgres · stub auth');
  console.log('  →  http://localhost:' + PORT + '/v1/elab');
  console.log('  Clinical decision support + real AutoDock Vina docking, out of the box.');
  console.log('  (Docking needs Docker + the anuclaw-vina image.)');
  console.log('');
});
