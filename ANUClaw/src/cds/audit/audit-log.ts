/**
 * Append-only, hash-chained audit log — synchronous (plan §5.4).
 *
 * Properties implemented here:
 *   - Immutability  : entries are only appended (the sink has no update/delete).
 *   - Integrity     : each entry is hash-chained to the previous (tamper-evident).
 *   - Attribution   : every entry carries an actor.
 *   - Reproducibility: structured payloads record inputs + versions.
 *   - Completeness  : `record` throws if the sink append fails, so a caller can
 *                     HALT rather than emit clinical output without a record.
 *   - Export        : signed bundle export for regulatory/legal review.
 *   - E-signature   : 21 CFR Part 11 clinician sign-off entries.
 *
 * For durable, async backends (e.g. Postgres) see `AsyncAuditLog`.
 */

import { canonicalize } from '../hashing';
import { GENESIS_HASH, verifyChain } from './hash-chain';
import {
  AuditBundle,
  AuditEntry,
  AuditSink,
  BundleSigner,
  ChainVerification,
  SignOffParams,
} from './types';
import {
  RETENTION_YEARS,
  RecordInput,
  buildNextEntry,
  buildSignOffInput,
} from './entry-factory';
import { InMemoryAuditSink } from './sinks';

export type { RecordInput } from './entry-factory';

export class AuditLog {
  constructor(
    private readonly sink: AuditSink = new InMemoryAuditSink(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Append one event. Throws if the sink fails (completeness → caller halts). */
  record(input: RecordInput): AuditEntry {
    const entry = buildNextEntry(this.sink.head(), input, this.clock());
    this.sink.append(entry); // throws on failure — intentionally not caught
    return entry;
  }

  /**
   * Record a 21 CFR Part 11 clinician sign-off (plan §5.3, §5.4). A modification
   * or override REQUIRES a structured reason.
   */
  signOff(params: SignOffParams): AuditEntry {
    return this.record(buildSignOffInput(params, this.clock()));
  }

  verify(): ChainVerification {
    return verifyChain(this.sink.all());
  }

  entries(): AuditEntry[] {
    return this.sink.all();
  }

  head(): AuditEntry | null {
    return this.sink.head();
  }

  /** Export a (optionally signed) bundle for regulatory/legal review (§5.4). */
  export(signer?: BundleSigner): AuditBundle {
    const entries = this.sink.all();
    const head = this.sink.head();
    const bundle: AuditBundle = {
      exported_at: this.clock().toISOString(),
      entry_count: entries.length,
      head_hash: head?.entry_hash ?? GENESIS_HASH,
      chain_valid: verifyChain(entries).valid,
      retention_years: RETENTION_YEARS,
      entries,
    };
    if (signer) {
      bundle.signature = signer(canonicalize({ ...bundle, signature: undefined }));
    }
    return bundle;
  }
}
