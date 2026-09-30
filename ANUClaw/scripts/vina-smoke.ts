/**
 * Real-docking smoke for the Vina engine (WS-A2). Needs Docker + anuclaw-vina image.
 * Prepares receptor+ligand PDBQT with Open Babel (in-container), computes a box
 * around the receptor centroid, and runs a REAL AutoDock Vina docking through
 * the VinaDockingEngine adapter. (Docking a molecule into itself — biologically
 * meaningless, but proves the engine runs end-to-end and returns affinities.)
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import { VinaDockingEngine } from '../src/engines';

const run = promisify(execFile);
const IMAGE = 'anuclaw-vina:latest';
const SMILES = 'CC(=O)Oc1ccccc1C(=O)O'; // aspirin

async function obabel(args: string[]): Promise<string> {
  const { stdout } = await run('docker', ['run', '--rm', IMAGE, 'obabel', ...args], {
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

function centroid(pdbqt: string): { x: number; y: number; z: number } {
  const xs: number[] = [], ys: number[] = [], zs: number[] = [];
  for (const line of pdbqt.split('\n')) {
    if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
      xs.push(parseFloat(line.slice(30, 38)));
      ys.push(parseFloat(line.slice(38, 46)));
      zs.push(parseFloat(line.slice(46, 54)));
    }
  }
  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(a.length, 1);
  return { x: +avg(xs).toFixed(3), y: +avg(ys).toFixed(3), z: +avg(zs).toFixed(3) };
}

(async () => {
  console.log('Preparing receptor + ligand with Open Babel…');
  const receptor = await obabel([`-:${SMILES}`, '-opdbqt', '--gen3d', '-xr']);
  const ligand = await obabel([`-:${SMILES}`, '-opdbqt', '--gen3d']);
  const c = centroid(receptor);
  console.log(`receptor atoms centroid = (${c.x}, ${c.y}, ${c.z})`);

  const engine = new VinaDockingEngine();
  console.log('Running AutoDock Vina (real docking)…');
  const result = await engine.run({
    receptor_pdbqt: receptor,
    ligand_pdbqt: ligand,
    box: { center_x: c.x, center_y: c.y, center_z: c.z, size_x: 25, size_y: 25, size_z: 25 },
    seed: 42,
    exhaustiveness: 8,
  });

  console.log('── Vina docking result ──');
  console.log(`best affinity: ${result.output.best_affinity_kcal_mol} kcal/mol`);
  console.log(`modes: ${result.output.modes.length}`);
  console.log(`engine: ${result.engine_id}@${result.engine_version} · seed=${result.seed} · class=${result.reproducibility_class}`);
  console.log(`input_hash: ${result.input_hash.slice(0, 16)}… · artifacts: ${result.artifacts.map((a) => `${a.id}(${a.bytes}B)`).join(', ')}`);
  console.log(`validated (clinical-eligible): ${engine.validated}`);
  process.exit(0);
})().catch((e) => {
  console.error('SMOKE FAILED:', e?.message ?? e);
  process.exit(1);
});
