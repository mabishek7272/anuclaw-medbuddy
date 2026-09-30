/** Runtime smoke for the E-LAB console router (WS-F) over real HTTP. */
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { createElabUiRouter } from '../src/api/routes/elab-ui';
import { renderElabConsole } from '../src/api/elab/console';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(createElabUiRouter());

// Also write a static preview file.
fs.writeFileSync(path.resolve(__dirname, '..', 'elab-console-preview.html'), renderElabConsole(), 'utf8');

const HER2 = { tumor_type: 'breast', stage: 'II', biomarker: 'HER2+', line: 1, candidate_regimen: ['trastuzumab', 'pertuzumab', 'docetaxel'] };
const ctx = (lvef: number) => ({ organ_function: { lvef }, allergies: { status: 'confirmed_none', items: [] }, current_medications: { status: 'confirmed_none', items: [] }, conditions: { status: 'confirmed_none', items: [] } });

const PORT = 4097;
const server = app.listen(PORT, async () => {
  const base = `http://127.0.0.1:${PORT}`;
  const post = async (p: string, b: unknown) => {
    const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
    return { status: r.status, body: (await r.json()) as any };
  };
  const page = await fetch(base + '/v1/elab');
  console.log(`GET /v1/elab → HTTP ${page.status} · html=${(await page.text()).includes('<!doctype html>')}`);

  const rec = await post('/v1/elab/demo/clinical', { query: HER2, context: ctx(60) });
  console.log(`demo clinical (LVEF 60) → HTTP ${rec.status} · decision=${rec.body.verdict?.decision}`);
  const blk = await post('/v1/elab/demo/clinical', { query: HER2, context: ctx(40) });
  console.log(`demo clinical (LVEF 40) → HTTP ${blk.status} · decision=${blk.body.verdict?.decision} · blocks=${blk.body.verdict?.blocks?.length}`);

  const dock = await post('/v1/elab/demo/dock', { ligand_smiles: 'CC(=O)Oc1ccccc1C(=O)O', receptor_smiles: 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C' });
  console.log(`demo dock (real Vina) → HTTP ${dock.status} · best=${dock.body.result?.output?.best_affinity_kcal_mol} kcal/mol · modes=${dock.body.result?.output?.modes?.length}`);
  console.log('wrote elab-console-preview.html');

  server.close(() => process.exit(0));
});
