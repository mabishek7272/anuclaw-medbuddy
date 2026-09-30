import { describe, it, expect } from 'vitest';
import { runAuditedPipeline } from './audited-pipeline';
import { AuditLog } from './audit-log';
import { InMemoryAuditSink } from './sinks';
import { AuditSink } from './types';
import { makeSnapshot, med, allergy, fixedClock } from '../safety/test-helpers';
import { handleHook } from '../hooks/cds-hooks';
import {
  Bundle,
  CdsHookRequest,
  MedicationResource,
  Observation,
  AllergyIntolerance,
  Condition,
} from '../fhir/types';

describe('runAuditedPipeline (plan §3.1, §3.2)', () => {
  it('records a complete, verifiable audit trail for a recommendation', async () => {
    const log = new AuditLog(new InMemoryAuditSink(), fixedClock);
    const r = await runAuditedPipeline(
      { snapshot: makeSnapshot(), gene: 'CYP2D6', now: fixedClock },
      log,
    );
    expect(r.verdict.decision).toBe('recommend');
    expect(log.verify().valid).toBe(true);

    const events = log.entries().map((e) => e.event_type);
    expect(events).toContain('arbitration.completed');
    expect(events).toContain('verdict.recorded');
    expect(events).toContain('explanation.recorded');
    expect(events).toContain('consistency.verified');
  });

  it('records the verdict hash so the decision is reproducible from the log', async () => {
    const log = new AuditLog(new InMemoryAuditSink(), fixedClock);
    const r = await runAuditedPipeline(
      { snapshot: makeSnapshot(), gene: 'CYP2D6', now: fixedClock },
      log,
    );
    const recorded = log.entries().find((e) => e.event_type === 'verdict.recorded');
    expect((recorded?.payload as { verdict_hash: string }).verdict_hash).toBe(
      r.verdict.verdict_hash,
    );
  });

  it('HALTS (throws) if an audit write fails — no result returned', async () => {
    const failing: AuditSink = {
      append: () => {
        throw new Error('audit store unavailable');
      },
      all: () => [],
      head: () => null,
    };
    const log = new AuditLog(failing, fixedClock);
    await expect(
      runAuditedPipeline({ snapshot: makeSnapshot(), gene: 'CYP2D6', now: fixedClock }, log),
    ).rejects.toThrow(/audit store unavailable/);
  });
});

// ── Audit wired into the CDS Hooks ingress ────────────────────────────────────

function bundle<T>(resources: T[]): Bundle<T> {
  return { resourceType: 'Bundle', entry: resources.map((r) => ({ resource: r })) };
}

function hookRequest(drug: string, diplotype: string, gene: string): CdsHookRequest {
  return {
    hook: 'order-sign',
    context: {
      patientId: 'p1',
      draftOrders: bundle<MedicationResource>([
        { resourceType: 'MedicationRequest', medicationCodeableConcept: { text: drug } },
      ]),
    },
    prefetch: {
      genotypes: bundle<Observation>([
        { resourceType: 'Observation', code: { text: `${gene} genotype` }, valueString: diplotype },
      ]),
      medications: bundle<MedicationResource>([]),
      allergies: bundle<AllergyIntolerance>([]),
      conditions: bundle<Condition>([]),
    },
  };
}

describe('CDS Hooks ingress with audit (completeness §3.2)', () => {
  it('records before emitting the card; chain verifies', async () => {
    const log = new AuditLog(new InMemoryAuditSink(), fixedClock);
    const { cards } = await handleHook(hookRequest('Codeine', '*1/*1', 'CYP2D6'), {
      auditLog: log,
      now: fixedClock,
    });
    expect(cards).toHaveLength(1);
    expect(log.entries().length).toBeGreaterThan(0);
    expect(log.verify().valid).toBe(true);
  });

  it('emits NO card if the audit write fails', async () => {
    const failing: AuditSink = {
      append: () => {
        throw new Error('audit down');
      },
      all: () => [],
      head: () => null,
    };
    const log = new AuditLog(failing, fixedClock);
    await expect(
      handleHook(hookRequest('Codeine', '*1/*1', 'CYP2D6'), { auditLog: log }),
    ).rejects.toThrow(/audit down/);
  });
});
