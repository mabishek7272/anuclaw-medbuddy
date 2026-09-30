/**
 * Per-tenant audit (Phase 0, WS-C3) — fixes review finding C3.
 *
 * The review flagged that the audit log was a single GLOBAL hash chain with no
 * tenant dimension, so one tenant's export would dump every tenant's entries.
 * This adds per-tenant segregation by COMPOSITION: each tenant gets its own
 * independent `AuditLog` (own genesis, own `seq`, own head/verify/export) over
 * its own sink. Isolation is structural — there is no shared chain to leak.
 *
 * Built without modifying the existing `AuditLog`/sinks, so CDS v3's audit
 * behaviour and tests are unaffected. For durable backends, pass a `sinkFactory`
 * that returns a tenant-scoped sink (e.g. a Postgres sink filtered by tenant_id);
 * the in-memory default suits P0 and tests.
 */

import { AuditLog } from './audit-log';
import { InMemoryAuditSink } from './sinks';
import { RecordInput } from './entry-factory';
import {
  AuditBundle,
  AuditEntry,
  AuditSink,
  BundleSigner,
  ChainVerification,
  SignOffParams,
} from './types';

export type SinkFactory = (tenantId: string) => AuditSink;

export class PerTenantAuditLog {
  private readonly logs = new Map<string, AuditLog>();

  constructor(
    private readonly sinkFactory: SinkFactory = () => new InMemoryAuditSink(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** The tenant's own audit chain (created on first use). */
  forTenant(tenantId: string): AuditLog {
    let log = this.logs.get(tenantId);
    if (!log) {
      log = new AuditLog(this.sinkFactory(tenantId), this.clock);
      this.logs.set(tenantId, log);
    }
    return log;
  }

  record(tenantId: string, input: RecordInput): AuditEntry {
    return this.forTenant(tenantId).record(input);
  }

  signOff(tenantId: string, params: SignOffParams): AuditEntry {
    return this.forTenant(tenantId).signOff(params);
  }

  verify(tenantId: string): ChainVerification {
    return this.forTenant(tenantId).verify();
  }

  entries(tenantId: string): AuditEntry[] {
    return this.forTenant(tenantId).entries();
  }

  /** Export ONE tenant's signed bundle — never another tenant's entries. */
  export(tenantId: string, signer?: BundleSigner): AuditBundle {
    return this.forTenant(tenantId).export(signer);
  }

  tenants(): string[] {
    return [...this.logs.keys()];
  }
}
