/**
 * Full real-engine RUO path over HTTP (WS-A2 × WS-D). Needs Docker + anuclaw-vina.
 * Boots the elab-platform router, prepares PDBQT with Open Babel, and POSTs a
 * docking job to /v1/ruo/docking-vina → gate → de-id → job runtime → REAL Vina
 * → per-tenant audited result. Proves the engine runs through the live API.
 */
import express from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createElabPlatformRouter } from '../src/api/routes/elab-platform';
import { createDefaultElabPlatform } from '../src/api/elab/platform';
import { TenantContext } from '../src/api/elab/types';

const run = promisify(execFile);
const IMAGE = 'anuclaw-vina:latest';
const SMILES = 'CC(=O)Oc1ccccc1C(=O)O';

async function obabel(args: string[]): Promise<string> {
  const { stdout } = await run('docker', ['run', '--rm', IMAGE, 'obabel', ...args], { maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}
function centroid(pdbqt: string) {
  const xs: number[] = [], ys: number[] = [], zs: number[] = [];
  for (const l of pdbqt.split('\n')) {
    if (l.startsWith('ATOM') || l.startsWith('HETATM')) {
      xs.push(parseFloat(l.slice(30, 38))); ys.push(parseFloat(l.slice(38, 46))); zs.push(parseFloat(l.slice(46, 54)));
    }
  }
  const avg = (a: number[]) => +(a.reduce((s, v) => s + v, 0) / Math.max(a.length, 1)).toFixed(3);
  return { x: avg(xs), y: avg(ys), z: avg(zs) };
}

const deps = createDefaultElabPlatform(); // includes VinaDockingEngine
const resolveContext = (): TenantContext => ({
  tenant_id: 'vina-smoke', scopes: ['ruo'], baa_active: false, allowed_clinical_domains: [], residency: 'us',
});
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(createElabPlatformRouter({ deps, resolveContext }));

const PORT = 4098;
const server = app.listen(PORT, async () => {
  try {
    console.log('Preparing PDBQT via Open Babel…');
    const receptor = await obabel([`-:${SMILES}`, '-opdbqt', '--gen3d', '-xr']);
    const ligand = await obabel([`-:${SMILES}`, '-opdbqt', '--gen3d']);
    const c = centroid(receptor);

    console.log('POST /v1/ruo/docking-vina (real Vina via the live API)…');
    const r = await fetch(`http://127.0.0.1:${PORT}/v1/ruo/docking-vina`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        input: {
          receptor_pdbqt: receptor, ligand_pdbqt: ligand,
          box: { center_x: c.x, center_y: c.y, center_z: c.z, size_x: 25, size_y: 25, size_z: 25 },
          seed: 42, exhaustiveness: 8,
        },
      }),
    });
    const body = (await r.json()) as any;
    console.log(`HTTP ${r.status} · tier=${body.tier} · regulatory="${body.regulatory}" · cached=${body.cached}`);
    console.log(`best affinity: ${body.result?.output?.best_affinity_kcal_mol} kcal/mol · modes=${body.result?.output?.modes?.length}`);
    console.log(`engine=${body.result?.engine_id}@${body.result?.engine_version} · class=${body.result?.reproducibility_class}`);
    console.log(`audit (vina-smoke): ${deps.audit.entries('vina-smoke').length} entry · chain valid=${deps.audit.verify('vina-smoke').valid}`);
  } catch (e) {
    console.error('SMOKE FAILED:', (e as Error)?.message ?? e);
  } finally {
    server.close(() => process.exit(0));
  }
});
