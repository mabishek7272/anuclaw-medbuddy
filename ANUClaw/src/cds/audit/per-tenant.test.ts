import { describe, it, expect } from 'vitest';
import { PerTenantAuditLog } from './per-tenant';
import { verifyChain } from './hash-chain';

const fixedClock = () => new Date('2026-06-13T00:00:00.000Z');

describe('PerTenantAuditLog — per-tenant segregation (WS-C3, fixes C3)', () => {
  it('keeps each tenant on its own independent chain', () => {
    const log = new PerTenantAuditLog(undefined, fixedClock);
    log.record('t1', { actor: 'a', event_type: 'e1', payload: { n: 1 } });
    log.record('t1', { actor: 'a', event_type: 'e2', payload: { n: 2 } });
    log.record('t2', { actor: 'b', event_type: 'e1', payload: { n: 9 } });

    // Each tenant's chain starts at seq 1 and only holds its own entries.
    expect(log.entries('t1').map((e) => e.seq)).toEqual([1, 2]);
    expect(log.entries('t2').map((e) => e.seq)).toEqual([1]);
    expect(log.entries('t1').every((e) => (e.payload as { n: number }).n !== 9)).toBe(true);
  });

  it('export(tenant) returns ONLY that tenant’s entries (no cross-tenant dump)', () => {
    const log = new PerTenantAuditLog(undefined, fixedClock);
    log.record('t1', { actor: 'a', event_type: 'e', payload: {} });
    log.record('t2', { actor: 'b', event_type: 'e', payload: {} });
    log.record('t2', { actor: 'b', event_type: 'e', payload: {} });

    expect(log.export('t1').entry_count).toBe(1);
    expect(log.export('t2').entry_count).toBe(2);
    expect(log.export('t1').head_hash).not.toBe(log.export('t2').head_hash);
  });

  it('each tenant chain verifies independently', () => {
    const log = new PerTenantAuditLog(undefined, fixedClock);
    log.record('t1', { actor: 'a', event_type: 'e', payload: {} });
    log.record('t2', { actor: 'b', event_type: 'e', payload: {} });
    expect(log.verify('t1').valid).toBe(true);
    expect(log.verify('t2').valid).toBe(true);
    // entries from different tenants are NOT one valid chain (proves isolation)
    const mixed = [...log.entries('t1'), ...log.entries('t2')];
    expect(verifyChain(mixed).valid).toBe(false);
  });

  it('records per-tenant clinician sign-offs', () => {
    const log = new PerTenantAuditLog(undefined, fixedClock);
    const e = log.signOff('t1', {
      verdict_hash: 'h',
      clinician: { id: 'dr-ng' },
      action: 'accept',
    });
    expect(e.actor).toBe('clinician:dr-ng');
    expect(log.tenants()).toEqual(expect.arrayContaining(['t1']));
    expect(log.verify('t1').valid).toBe(true);
  });
});
