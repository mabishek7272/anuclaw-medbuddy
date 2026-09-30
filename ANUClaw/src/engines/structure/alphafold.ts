/**
 * Structure lookup — AlphaFold DB engine (Phase 0, WS-A5, RUO).
 *
 * Fetches a predicted protein structure record from the PUBLIC EBI AlphaFold
 * Database (https://alphafold.ebi.ac.uk) by UniProt accession. No API key.
 *
 * This is a `snapshot_only_external` engine: the result is a point-in-time
 * lookup against a remote service, NOT a locally re-derivable computation —
 * the reproducibility class and provenance say so explicitly. Network failure
 * fails closed with EngineError('unavailable').
 */

import {
  EngineAdapter,
  EngineError,
  EngineResult,
  RunContext,
  hashEngineInput,
  nowIso,
} from '../types';

export interface StructureInput { uniprot: string }
export interface StructureResult {
  uniprot_accession: string;
  entry_id: string;
  gene?: string;
  organism?: string;
  description?: string;
  sequence_length?: number;
  model_version?: number;
  cif_url?: string;
  pdb_url?: string;
  pae_image_url?: string;
  source: string;
  fetched_at: string;
}

const API = 'https://alphafold.ebi.ac.uk/api/prediction';

type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export class AlphaFoldStructureEngine implements EngineAdapter<StructureInput, StructureResult> {
  readonly id = 'structure-alphafold-db';
  readonly version = '1.0.0';
  readonly validated = false; // RUO
  readonly reproducibility_class = 'snapshot_only_external' as const;

  /** fetch is injectable so the parse/mapping logic is testable without network. */
  constructor(private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init) as any) {}

  async run(input: StructureInput, ctx?: RunContext): Promise<EngineResult<StructureResult>> {
    const acc = String(input?.uniprot ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6,10}$/.test(acc)) {
      throw new EngineError('invalid_input', 'uniprot must be a UniProt accession (e.g. P69905)');
    }

    let arr: any[];
    try {
      const resp = await this.fetchImpl(`${API}/${acc}`, { signal: ctx?.signal, headers: { accept: 'application/json' } });
      if (resp.status === 404) throw new EngineError('invalid_input', `no AlphaFold model for accession ${acc}`);
      if (!resp.ok) throw new EngineError('unavailable', `AlphaFold DB returned ${resp.status}`);
      arr = (await resp.json()) as any[];
    } catch (e) {
      if (e instanceof EngineError) throw e;
      throw new EngineError('unavailable', `AlphaFold DB unreachable: ${e instanceof Error ? e.message : String(e)}`);
    }
    const p = Array.isArray(arr) ? arr[0] : undefined;
    if (!p) throw new EngineError('invalid_input', `no AlphaFold model for accession ${acc}`);

    const fetched_at = nowIso(ctx?.now);
    const output: StructureResult = {
      uniprot_accession: acc,
      entry_id: p.entryId ?? `AF-${acc}`,
      gene: p.gene,
      organism: p.organismScientificName,
      description: p.uniprotDescription,
      sequence_length: typeof p.uniprotEnd === 'number' ? p.uniprotEnd : undefined,
      model_version: p.latestVersion,
      cif_url: p.cifUrl,
      pdb_url: p.pdbUrl,
      pae_image_url: p.paeImageUrl,
      source: `${API}/${acc}`,
      fetched_at,
    };

    return {
      engine_id: this.id,
      engine_version: this.version,
      input_hash: hashEngineInput(this.id, this.version, { uniprot: acc }),
      output,
      artifacts: output.pdb_url ? [{ id: output.entry_id, kind: 'structure', hash: output.pdb_url }] : [],
      provenance: { tool: 'alphafold-db', tool_version: String(p.latestVersion ?? 'unknown'), params: { uniprot: acc }, refdb_versions: { alphafold_db: String(p.latestVersion ?? 'unknown') } },
      reproducibility_class: this.reproducibility_class,
      started_at: fetched_at,
      finished_at: nowIso(ctx?.now),
    };
  }
}
