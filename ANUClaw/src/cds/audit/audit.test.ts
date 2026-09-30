import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AuditLog } from './audit-log';
import { InMemoryAuditSink, FileAuditSink } from './sinks';
import { GENESIS_HASH, verifyChain } from './hash-chain';
import { AuditEntry, AuditSink } from './types';

const fixedClock = () => new Date('2026-06-12T00:00:00.000Z');

describe('audit log — hash chain (plan §5.4)', () => {
  it('links each entry to the previous and verifies clean', () => {
    const log = new AuditLog(new InMemoryAuditSink(), fixedClock);
    const a = log.record({ actor: 'system:a', event_type: 'e1', payload: { x: 1 } });
    const b = log.record({ actor: 'system:b', event_type: 'e2', payload: { x: 2 } });
    const c = log.record({ actor: 'system:c', event_type: 'e3', payload: { x: 3 } });

    expect(a.prev_hash).toBe(GENESIS_HASH);
    expect(b.prev_hash).toBe(a.entry_hash);
    expect(c.prev_hash).toBe(b.entry_hash);
    expect(a.seq).toBe(1);
    expect(c.seq).toBe(3);
    expect(log.verify().valid).toBe(true);
  });

  it('detects a tampered payload (tamper-evident)', () => {
    const log = new AuditLog(new InMemoryAuditSink(), fixedClock);
    log.record({ actor: 'system:a', event_type: 'e1', payload: { dose: 'standard' } });
    log.record({ actor: 'system:b', event_type: 'e2', payload: { dose: 'standard' } });

    // Simulate an attacker editing history (entry_hash left stale).
    const tampered: AuditEntry[] = log.entries().map((e, i) =>
      i === 0 ? { ...e, payload: { dose: 'double' } } : e,
    );
    const result = verifyChain(tampered);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
    expect(result.reason).toMatch(/tamper/i);
  });

  it('detects a removed/reordered entry via broken links', () => {
    const log = new AuditLog(new InMemoryAuditSink(), fixedClock);
    log.record({ actor: 'a', event_type: 'e1', payload: {} });
    log.record({ actor: 'b', event_type: 'e2', payload: {} });
    log.record({ actor: 'c', event_type: 'e3', payload: {} });
    const withGap = [log.entries()[0], log.entries()[2]]; // drop entry 2
    expect(verifyChain(withGap).valid).toBe(false);
  });
});

describe('audit log — completeness halt (plan §3.2)', () => {
  it('propagates a sink failure so the caller can halt', () => {
    const failing: AuditSink = {
      append: () => {
        throw new Error('disk full');
      },
      all: () => [],
      head: () => null,
    };
    const log = new AuditLog(failing, fixedClock);
    expect(() => log.record({ actor: 'a', event_type: 'e', payload: {} })).toThrow(/disk full/);
  });
});

describe('audit log — 21 CFR Part 11 sign-off (plan §5.3, §5.4)', () => {
  it('records an accept sign-off with meaning + attribution', () => {
    const log = new AuditLog(new InMemoryAuditSink(), fixedClock);
    const e = log.signOff({
      verdict_hash: 'abc123',
      clinician: { id: 'dr-ng', name: 'Dr Ng' },
      action: 'accept',
    });
    expect(e.actor).toBe('clinician:dr-ng');
    expect(e.event_type).toBe('clinician.signoff');
    const p = e.payload as { meaning: string; signed_at: string; action: string };
    expect(p.action).toBe('accept');
    expect(p.meaning).toMatch(/accepted/);
    expect(p.signed_at).toBe('2026-06-12T00:00:00.000Z');
  });

  it('requires a structured reason for an override/modification', () => {
    const log = new AuditLog(new InMemoryAuditSink(), fixedClock);
    expect(() =>
      log.signOff({ verdict_hash: 'h', clinician: { id: 'd' }, action: 'reject' }),
    ).toThrow(/override_reason is required/);

    const e = log.signOff({
      verdict_hash: 'h',
      clinician: { id: 'd' },
      action: 'reject',
      override_reason: 'Patient already stable on current therapy.',
    });
    expect((e.payload as { override_reason: string }).override_reason).toMatch(/stable/);
  });
});

describe('audit log — signed export (plan §5.4)', () => {
  it('exports a bundle with head hash + retention, and a detached signature', () => {
    const log = new AuditLog(new InMemoryAuditSink(), fixedClock);
    log.record({ actor: 'a', event_type: 'e1', payload: {} });
    const head = log.record({ actor: 'b', event_type: 'e2', payload: {} });

    const bundle = log.export((canon) => `sig:${canon.length}`);
    expect(bundle.entry_count).toBe(2);
    expect(bundle.head_hash).toBe(head.entry_hash);
    expect(bundle.chain_valid).toBe(true);
    expect(bundle.retention_years).toBe(7);
    expect(bundle.signature).toMatch(/^sig:/);
  });
});

describe('audit log — file sink (append-only JSONL)', () => {
  const file = path.join(os.tmpdir(), `anuclaw-audit-${Date.now()}.jsonl`);
  afterEach(() => {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });

  it('persists and reloads a verifiable chain', () => {
    const log = new AuditLog(new FileAuditSink(file), fixedClock);
    log.record({ actor: 'a', event_type: 'e1', payload: { n: 1 } });
    log.record({ actor: 'b', event_type: 'e2', payload: { n: 2 } });

    // Re-open the same file with a fresh log instance.
    const reopened = new AuditLog(new FileAuditSink(file), fixedClock);
    expect(reopened.entries()).toHaveLength(2);
    expect(reopened.verify().valid).toBe(true);
  });
});
