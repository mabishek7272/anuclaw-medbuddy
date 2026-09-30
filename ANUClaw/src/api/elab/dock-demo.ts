/**
 * One-click docking demo (WS-F demo aid). Prepares PDBQT from SMILES with Open
 * Babel and runs REAL AutoDock Vina — so the docking engine is demoable from the
 * browser without hand-prepared PDBQT. Needs Docker + the anuclaw-vina image.
 *
 * NOTE: demo molecules dock into a demo "receptor" — a real technical run of the
 * engine, but not a biologically-meaningful target. Internal demonstration only.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { VinaDockingEngine, DockingResult } from '../../engines';
import { EngineResult } from '../../engines';

const run = promisify(execFile);
const IMAGE = process.env.ANUCLAW_VINA_IMAGE ?? 'anuclaw-vina:latest';

async function obabel(args: string[]): Promise<string> {
  const { stdout } = await run('docker', ['run', '--rm', IMAGE, 'obabel', ...args], { maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

function centroid(pdbqt: string): { x: number; y: number; z: number } {
  const xs: number[] = [], ys: number[] = [], zs: number[] = [];
  for (const l of pdbqt.split('\n')) {
    if (l.startsWith('ATOM') || l.startsWith('HETATM')) {
      xs.push(parseFloat(l.slice(30, 38))); ys.push(parseFloat(l.slice(38, 46))); zs.push(parseFloat(l.slice(46, 54)));
    }
  }
  const avg = (a: number[]) => +(a.reduce((s, v) => s + v, 0) / Math.max(a.length, 1)).toFixed(3);
  return { x: avg(xs), y: avg(ys), z: avg(zs) };
}

const col = (v: number) => v.toFixed(3).padStart(8);

/** Translate a ligand PDBQT so its centroid sits at `target` (inside the box). */
function recenterLigand(pdbqt: string, target: { x: number; y: number; z: number }): string {
  const c = centroid(pdbqt);
  const dx = target.x - c.x, dy = target.y - c.y, dz = target.z - c.z;
  return pdbqt
    .split('\n')
    .map((line) => {
      if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
        const x = parseFloat(line.slice(30, 38)) + dx;
        const y = parseFloat(line.slice(38, 46)) + dy;
        const z = parseFloat(line.slice(46, 54)) + dz;
        return line.slice(0, 30) + col(x) + col(y) + col(z) + line.slice(54);
      }
      return line;
    })
    .join('\n');
}

export interface DockDemoRequest {
  ligand_smiles: string;
  receptor_smiles?: string;
  seed?: number;
}

export type DockDemoResult =
  | { ok: true; result: EngineResult<DockingResult> }
  | { ok: false; error: string };

export async function dockFromSmiles(req: DockDemoRequest): Promise<DockDemoResult> {
  if (!req.ligand_smiles?.trim()) return { ok: false, error: 'ligand_smiles is required' };
  try {
    const ligandRaw = await obabel([`-:${req.ligand_smiles}`, '-opdbqt', '--gen3d']);
    const receptor = await obabel([`-:${req.receptor_smiles?.trim() || req.ligand_smiles}`, '-opdbqt', '--gen3d', '-xr']);
    const c = centroid(receptor);
    // Place the ligand at the receptor's box centre so it's inside the search space.
    const ligand = recenterLigand(ligandRaw, c);
    const engine = new VinaDockingEngine({ image: IMAGE });
    const result = await engine.run({
      receptor_pdbqt: receptor,
      ligand_pdbqt: ligand,
      box: { center_x: c.x, center_y: c.y, center_z: c.z, size_x: 25, size_y: 25, size_z: 25 },
      seed: req.seed ?? 42,
      exhaustiveness: 8,
    });
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
