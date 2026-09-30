/**
 * Append-only, hash-chained audit log — asynchronous (plan §5.4).
 *
 * Identical guarantees to `AuditLog`, but over an async backend such as
 * Postgres. Shares the exact entry-construction logic, so chains produced by the
 * sync and async logs are byte-identical and verify with the same `verifyChain`.
 */

import { canonicalize } from '../hashing';
import { GENESIS_HASH, verifyChain } from './hash-chain';
import {
  AuditBundle,
  AuditEntry,
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

/** Async append-only storage backend (no update/delete — immutability). */
export interface AsyncAuditSink {
  append(entry: AuditEntry): Promise<void>;
  all(): Promise<AuditEntry[]>;
  head(): Promise<AuditEntry | null>;
}

export class AsyncAuditLog {
  constructor(
    private readonly sink: AsyncAuditSink,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async record(input: RecordInput): Promise<AuditEntry> {
    const prev = await this.sink.head();
    const entry = buildNextEntry(prev, input, this.clock());
    await this.sink.append(entry); // rejects on failure → caller halts
    return entry;
  }

  async signOff(params: SignOffParams): Promise<AuditEntry> {
    return this.record(buildSignOffInput(params, this.clock()));
  }

  async verify(): Promise<ChainVerification> {
    return verifyChain(await this.sink.all());
  }

  async entries(): Promise<AuditEntry[]> {
    return this.sink.all();
  }

  async head(): Promise<AuditEntry | null> {
    return this.sink.head();
  }

  async export(signer?: BundleSigner): Promise<AuditBundle> {
    const entries = await this.sink.all();
    const head = entries.length ? entries[entries.length - 1] : null;
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
