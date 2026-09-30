/**
 * Audit-layer types (plan §5.4, §3.1, §3.2).
 *
 * The audit log is append-only and hash-chained: every entry links to the
 * previous entry's hash, so any alteration to history is detectable. Entries
 * carry an actor (attribution), structured payload (reproducibility), and are
 * never updated or deleted (immutability).
 */

export interface AuditEntry {
  /** 1-based monotonic sequence number. */
  seq: number;
  /** ISO timestamp the entry was recorded. */
  timestamp: string;
  /** Who/what produced the event, e.g. 'system:arbitrator', 'clinician:dr-ng'. */
  actor: string;
  /** Event name, e.g. 'phenotype.assigned', 'arbitration.completed'. */
  event_type: string;
  /** Structured event data; must be JSON-serialisable and reproducible. */
  payload: unknown;
  /** entry_hash of the previous entry (GENESIS_HASH for the first). */
  prev_hash: string;
  /** SHA-256 over this entry's canonical content (excluding entry_hash). */
  entry_hash: string;
}

/**
 * Storage backend for the audit log. Deliberately append-only: there is no
 * update or delete method (immutability, plan §5.4).
 */
export interface AuditSink {
  /** Durably append one entry. MUST throw on failure (completeness, §3.2). */
  append(entry: AuditEntry): void;
  /** All entries in sequence order. */
  all(): AuditEntry[];
  /** The most recent entry, or null if empty. */
  head(): AuditEntry | null;
}

export interface ChainVerification {
  valid: boolean;
  /** Sequence number of the first broken entry, if any. */
  brokenAt?: number;
  reason?: string;
}

export type SignOffAction = 'accept' | 'accept_with_modification' | 'reject';

export interface ClinicianIdentity {
  id: string;
  name?: string;
}

export interface SignOffParams {
  /** The verdict being signed off (links the signature to the decision). */
  verdict_hash: string;
  clinician: ClinicianIdentity;
  action: SignOffAction;
  /** Structured reason — REQUIRED for modification or override (plan §5.3). */
  override_reason?: string;
}

/** 21 CFR Part 11 e-signature payload (printed name, datetime, meaning). */
export interface SignOffPayload {
  verdict_hash: string;
  clinician_id: string;
  clinician_name?: string;
  action: SignOffAction;
  meaning: string;
  override_reason?: string;
  signed_at: string;
}

export interface AuditBundle {
  exported_at: string;
  entry_count: number;
  head_hash: string;
  chain_valid: boolean;
  /** Retention target in years (aligned to clinical-records requirements). */
  retention_years: number;
  entries: AuditEntry[];
  /** Optional detached signature over the bundle's canonical content. */
  signature?: string;
}

/** Signs the canonical form of a bundle; e.g. an HMAC or detached signature. */
export type BundleSigner = (canonicalBundle: string) => string;
