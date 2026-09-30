import { describe, it, expect } from 'vitest';
import { renderElabConsole } from './console';

describe('E-LAB console UI (WS-F)', () => {
  const html = renderElabConsole();

  it('is a light-theme tabbed page', () => {
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('--bg:#f5f7fa');
    expect(html).toContain('data-tab="clinical"');
    expect(html).toContain('data-tab="ruo"');
    expect(html).toContain('Drug Combination');
    expect(html).toContain('Engines (RUO)');
  });

  it('wires the clinical demo + RUO endpoints', () => {
    expect(html).toContain('/v1/elab/demo/clinical');
    expect(html).toContain("'/v1/ruo/'");
    expect(html).toContain('X-API-Key');
  });

  it('labels the demo as non-clinical seed data', () => {
    expect(html).toMatch(/seed|not for clinical/i);
  });

  it('includes the one-click SMILES docking panel wired to the demo endpoint', () => {
    expect(html).toContain('id="d-ligand"');
    expect(html).toContain('/v1/elab/demo/dock');
    expect(html).toContain('AutoDock Vina');
  });
});
