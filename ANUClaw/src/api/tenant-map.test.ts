import { describe, it, expect } from 'vitest';
import { mapTenantRow } from './tenant-map';

describe('mapTenantRow (ops: tenant tiering columns)', () => {
  it('parses JSON scopes + allowed_clinical_domains into arrays', () => {
    const t = mapTenantRow({
      tenant_id: 't1',
      scopes: '["ruo","clinical"]',
      baa_status: 'active',
      residency: 'eu',
      allowed_clinical_domains: '["oncology-combination"]',
    });
    expect(t.scopes).toEqual(['ruo', 'clinical']);
    expect(t.allowed_clinical_domains).toEqual(['oncology-combination']);
    expect(t.baa_status).toBe('active');
    expect(t.residency).toBe('eu');
  });

  it('leaves null columns undefined (tenant without grants)', () => {
    const t = mapTenantRow({ tenant_id: 't2', scopes: null, allowed_clinical_domains: null });
    expect(t.scopes).toBeUndefined();
    expect(t.allowed_clinical_domains).toBeUndefined();
  });

  it('tolerates malformed JSON without throwing', () => {
    const t = mapTenantRow({ tenant_id: 't3', scopes: 'not-json' });
    expect(t.scopes).toBeUndefined();
  });

  it('passes through already-array values', () => {
    const t = mapTenantRow({ tenant_id: 't4', scopes: ['ruo'] });
    expect(t.scopes).toEqual(['ruo']);
  });
});
