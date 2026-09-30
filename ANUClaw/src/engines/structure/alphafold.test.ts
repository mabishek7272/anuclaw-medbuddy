import { describe, it, expect } from 'vitest';
import { AlphaFoldStructureEngine } from './alphafold';

// Shape mirrors the real EBI AlphaFold DB /api/prediction/<acc> response.
const SAMPLE = [{
  entryId: 'AF-P69905-F1',
  gene: 'HBA1',
  uniprotAccession: 'P69905',
  uniprotDescription: 'Hemoglobin subunit alpha',
  organismScientificName: 'Homo sapiens',
  uniprotEnd: 142,
  latestVersion: 4,
  cifUrl: 'https://alphafold.ebi.ac.uk/files/AF-P69905-F1-model_v4.cif',
  pdbUrl: 'https://alphafold.ebi.ac.uk/files/AF-P69905-F1-model_v4.pdb',
  paeImageUrl: 'https://alphafold.ebi.ac.uk/files/AF-P69905-F1-predicted_aligned_error_v4.png',
}];

const okFetch = (body: unknown) => async () => ({ ok: true, status: 200, json: async () => body });

describe('AlphaFold structure engine', () => {
  it('maps a prediction record into a structured result', async () => {
    const e = new AlphaFoldStructureEngine(okFetch(SAMPLE) as any);
    const r = await e.run({ uniprot: 'p69905' }, { now: () => new Date(0) });
    expect(r.output.entry_id).toBe('AF-P69905-F1');
    expect(r.output.organism).toBe('Homo sapiens');
    expect(r.output.sequence_length).toBe(142);
    expect(r.output.pdb_url).toContain('.pdb');
    expect(r.reproducibility_class).toBe('snapshot_only_external');
    expect(r.artifacts[0]?.kind).toBe('structure');
  });

  it('validates the accession format', async () => {
    const e = new AlphaFoldStructureEngine(okFetch(SAMPLE) as any);
    await expect(e.run({ uniprot: 'not!valid' })).rejects.toThrow();
  });

  it('fails closed (unavailable) on network error', async () => {
    const e = new AlphaFoldStructureEngine((async () => { throw new Error('ENOTFOUND'); }) as any);
    await expect(e.run({ uniprot: 'P69905' })).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('reports invalid_input when the accession has no model (404)', async () => {
    const e = new AlphaFoldStructureEngine((async () => ({ ok: false, status: 404, json: async () => ({}) })) as any);
    await expect(e.run({ uniprot: 'P00000' })).rejects.toMatchObject({ code: 'invalid_input' });
  });
});
