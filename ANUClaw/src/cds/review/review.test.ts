import { describe, it, expect } from 'vitest';
import { evaluateForReview, submitSignOff } from './review-service';
import { renderReviewPage } from './page';
import { DEMO_REQUEST } from './demo-fixture';
import { AuditLog } from '../audit/audit-log';
import { InMemoryAuditSink } from '../audit/sinks';
import { fixedClock } from '../safety/test-helpers';

describe('clinician review — evaluation (plan §5.3)', () => {
  it('returns review items with verdict hashes and records to the shared audit log', async () => {
    const log = new AuditLog(new InMemoryAuditSink(), fixedClock);
    const ev = await evaluateForReview(DEMO_REQUEST, { auditLog: log, now: fixedClock });

    expect(ev.patientId).toBe('demo-patient-001');
    expect(ev.items.length).toBe(2);

    const byDrug = Object.fromEntries(ev.items.map((i) => [i.drug, i]));
    // clopidogrel PM → "avoid" recommendation → warning
    expect(byDrug['clopidogrel'].decision).toBe('recommend');
    expect(byDrug['clopidogrel'].indicator).toBe('warning');
    // codeine UM + codeine allergy → safety block → critical
    expect(byDrug['codeine'].decision).toBe('block');
    expect(byDrug['codeine'].indicator).toBe('critical');

    for (const item of ev.items) {
      expect(item.verdict_hash).toMatch(/^[a-f0-9]{64}$/);
    }
    // Evaluation recorded a verifiable audit trail.
    expect(log.verify().valid).toBe(true);
    expect(log.entries().some((e) => e.event_type === 'verdict.recorded')).toBe(true);
  });
});

describe('clinician review — sign-off (plan §5.3 step 4–5)', () => {
  it('records an accept sign-off chained onto the same log', async () => {
    const log = new AuditLog(new InMemoryAuditSink(), fixedClock);
    const ev = await evaluateForReview(DEMO_REQUEST, { auditLog: log, now: fixedClock });
    const target = ev.items[0];

    const entry = submitSignOff(
      { verdict_hash: target.verdict_hash, clinician: { id: 'dr-ng' }, action: 'accept' },
      log,
    );
    expect(entry.event_type).toBe('clinician.signoff');
    expect(log.verify().valid).toBe(true);
    expect(log.head()?.actor).toBe('clinician:dr-ng');
  });

  it('rejects an override with no structured reason (400-class error)', async () => {
    const log = new AuditLog(new InMemoryAuditSink(), fixedClock);
    expect(() =>
      submitSignOff(
        { verdict_hash: 'h', clinician: { id: 'd' }, action: 'reject' },
        log,
      ),
    ).toThrow(/override_reason is required/);
  });

  it('captures the structured reason on an override', async () => {
    const log = new AuditLog(new InMemoryAuditSink(), fixedClock);
    const entry = submitSignOff(
      {
        verdict_hash: 'h',
        clinician: { id: 'd', name: 'Dr D' },
        action: 'reject',
        override_reason: 'Alternative antiplatelet contraindicated; accepting PGx risk with monitoring.',
      },
      log,
    );
    expect((entry.payload as { override_reason: string }).override_reason).toMatch(/monitoring/);
  });
});

describe('clinician review — rendered page', () => {
  it('renders cards, escapes content, and wires the sign-off form', async () => {
    const ev = await evaluateForReview(DEMO_REQUEST, { now: fixedClock });
    const html = renderReviewPage(ev.items, 'dr-ng');

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Clinician Review');
    // both cards present, keyed by verdict hash
    for (const item of ev.items) {
      expect(html).toContain(`data-verdict="${item.verdict_hash}"`);
    }
    expect(html).toContain('CRITICAL'); // the codeine block
    expect(html).toContain('signoff'); // form posts to the signoff endpoint
  });

  it('renders the light-theme console shell with nav tabs and controls', async () => {
    const ev = await evaluateForReview(DEMO_REQUEST, { now: fixedClock });
    const html = renderReviewPage(ev.items, 'dr-ng');
    // tabbed navigation
    expect(html).toContain('data-tab="review"');
    expect(html).toContain('data-tab="audit"');
    expect(html).toContain('data-tab="service"');
    // working controls wired to the real endpoints
    expect(html).toContain('id="btn-eval"');
    expect(html).toContain('id="btn-verify"');
    expect(html).toContain('id="btn-export"');
    // endpoints (configurable base injected as window.__CDS__)
    expect(html).toContain('"apiBase":"/cds/review"');
    expect(html).toContain('"servicePath":"/cds-services"');
    expect(html).toContain("'/evaluate'");
    expect(html).toContain("'/audit/verify'");
    // SMART token field for authenticated calls (shown by default)
    expect(html).toContain('id="token"');
    // light theme background
    expect(html).toContain('--bg:#f5f7fa');
  });

  it('supports an embedded (cookie-auth) mode: custom base, no token field', async () => {
    const ev = await evaluateForReview(DEMO_REQUEST, { now: fixedClock });
    const html = renderReviewPage(ev.items, 'dr-ng', {
      apiBase: '/api/cds',
      servicePath: '/api/cds/service',
      showToken: false,
    });
    expect(html).toContain('"apiBase":"/api/cds"');
    expect(html).toContain('"showToken":false');
    expect(html).not.toContain('id="token"'); // token field hidden under cookie auth
  });

  it('does not emit raw script tags from card content (escaping)', () => {
    const html = renderReviewPage([
      {
        gene: 'CYP2D6',
        drug: 'codeine',
        verdict_hash: 'a'.repeat(64),
        decision: 'block',
        indicator: 'critical',
        escalated: false,
        card: {
          summary: '<script>alert(1)</script>',
          indicator: 'critical',
          detail: 'x',
          source: { label: 'CPIC' },
        },
      },
    ]);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
