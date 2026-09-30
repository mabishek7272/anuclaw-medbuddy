/**
 * AutoDock Vina docking engine (Phase 0, WS-A2) — a REAL engine adapter.
 *
 * Implements the `EngineAdapter` contract by running `vina` inside the
 * `anuclaw-vina` container (built from `container/vina.Dockerfile`). Structured
 * input/output, recorded seed (Vina is stochastic → reproducible on pinned
 * hardware/image), provenance, and the standard error taxonomy. No LLM/agent.
 *
 * `parseVinaOutput` is pure and unit-tested; the adapter shells out to docker
 * (verified via `scripts/vina-smoke.ts`, which needs Docker + the image).
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { sha256 } from '../../cds/hashing';
import {
  EngineAdapter,
  EngineError,
  EngineResult,
  RunContext,
  hashEngineInput,
  nowIso,
} from '../types';

const run = promisify(execFile);

export interface DockingBox {
  center_x: number;
  center_y: number;
  center_z: number;
  size_x: number;
  size_y: number;
  size_z: number;
}

export interface DockingInput {
  /** Prepared receptor in PDBQT format. */
  receptor_pdbqt: string;
  /** Prepared ligand in PDBQT format. */
  ligand_pdbqt: string;
  box: DockingBox;
  exhaustiveness?: number;
  seed?: number;
}

export interface DockingMode {
  mode: number;
  affinity_kcal_mol: number;
  rmsd_lb: number;
  rmsd_ub: number;
}

export interface DockingResult {
  best_affinity_kcal_mol: number;
  modes: DockingMode[];
}

const MODE_RE = /^\s*(\d+)\s+(-?\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s*$/;

/** Parse Vina's scoring table from stdout into structured modes. Pure. */
export function parseVinaOutput(stdout: string): DockingResult {
  const modes: DockingMode[] = [];
  for (const line of stdout.split('\n')) {
    const m = MODE_RE.exec(line);
    if (m) {
      modes.push({
        mode: parseInt(m[1], 10),
        affinity_kcal_mol: parseFloat(m[2]),
        rmsd_lb: parseFloat(m[3]),
        rmsd_ub: parseFloat(m[4]),
      });
    }
  }
  if (modes.length === 0) {
    throw new EngineError('crashed', 'no docking modes found in Vina output');
  }
  return { best_affinity_kcal_mol: modes[0].affinity_kcal_mol, modes };
}

export interface VinaEngineOptions {
  image?: string;
  dockerPath?: string;
  timeoutMs?: number;
}

export class VinaDockingEngine implements EngineAdapter<DockingInput, DockingResult> {
  readonly id = 'docking-vina';
  readonly version = '1.2.5';
  /** Seed content / unprepared receptor handling — not yet clinically validated. */
  readonly validated = false;
  readonly reproducibility_class = 'seed_reproducible_pinned_hw' as const;

  private readonly image: string;
  private readonly dockerPath: string;
  private readonly timeoutMs: number;

  constructor(opts: VinaEngineOptions = {}) {
    this.image = opts.image ?? 'anuclaw-vina:latest';
    this.dockerPath = opts.dockerPath ?? 'docker';
    this.timeoutMs = opts.timeoutMs ?? 120_000;
  }

  async run(input: DockingInput, ctx?: RunContext): Promise<EngineResult<DockingResult>> {
    if (!input?.receptor_pdbqt?.trim() || !input?.ligand_pdbqt?.trim()) {
      throw new EngineError('invalid_input', 'receptor_pdbqt and ligand_pdbqt are required');
    }
    const seed = input.seed ?? 42;
    const exhaustiveness = input.exhaustiveness ?? 8;
    const started_at = nowIso(ctx?.now);

    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'anuclaw-vina-'));
    try {
      await fs.writeFile(path.join(work, 'receptor.pdbqt'), input.receptor_pdbqt, 'utf8');
      await fs.writeFile(path.join(work, 'ligand.pdbqt'), input.ligand_pdbqt, 'utf8');

      const args = [
        'run', '--rm', '-v', `${work}:/work`, this.image,
        'vina',
        '--receptor', '/work/receptor.pdbqt',
        '--ligand', '/work/ligand.pdbqt',
        '--center_x', String(input.box.center_x),
        '--center_y', String(input.box.center_y),
        '--center_z', String(input.box.center_z),
        '--size_x', String(input.box.size_x),
        '--size_y', String(input.box.size_y),
        '--size_z', String(input.box.size_z),
        '--exhaustiveness', String(exhaustiveness),
        '--seed', String(seed),
        '--out', '/work/out.pdbqt',
      ];

      let stdout: string;
      try {
        const res = await run(this.dockerPath, args, {
          timeout: ctx?.signal ? undefined : this.timeoutMs,
          maxBuffer: 16 * 1024 * 1024,
          signal: ctx?.signal,
        });
        stdout = res.stdout;
      } catch (e) {
        const err = e as NodeJS.ErrnoException & { killed?: boolean; signal?: string; stderr?: string };
        if (err.killed || err.signal === 'SIGTERM') {
          throw new EngineError('timeout', `vina exceeded ${this.timeoutMs}ms`);
        }
        throw new EngineError('crashed', `vina failed: ${err.stderr || err.message}`);
      }

      const result = parseVinaOutput(stdout);
      let outPdbqt = '';
      try {
        outPdbqt = await fs.readFile(path.join(work, 'out.pdbqt'), 'utf8');
      } catch {
        /* poses optional */
      }

      return {
        engine_id: this.id,
        engine_version: this.version,
        input_hash: hashEngineInput(this.id, this.version, input),
        output: result,
        seed,
        artifacts: outPdbqt
          ? [{ id: 'out.pdbqt', kind: 'pose', hash: sha256(outPdbqt), bytes: Buffer.byteLength(outPdbqt) }]
          : [],
        provenance: {
          tool: 'autodock-vina',
          tool_version: this.version,
          params: { box: input.box, exhaustiveness, seed },
          container_digest: this.image,
        },
        reproducibility_class: this.reproducibility_class,
        started_at,
        finished_at: nowIso(ctx?.now),
      };
    } finally {
      await fs.rm(work, { recursive: true, force: true }).catch(() => {});
    }
  }
}
