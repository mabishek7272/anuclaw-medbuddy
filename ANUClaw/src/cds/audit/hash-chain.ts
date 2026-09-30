/**
 * Hash-chain primitives for the audit log (plan §5.4 "Integrity: hash-chained
 * entries; tamper-evident").
 *
 * An entry's hash covers its content AND the previous entry's hash, so altering
 * any historical entry (or reordering/removing one) breaks every subsequent
 * link and is detected by `verifyChain`.
 */

import { canonicalize, sha256 } from '../hashing';
import { AuditEntry, ChainVerification } from './types';

/** prev_hash of the very first entry. */
export const GENESIS_HASH = '0'.repeat(64);

/** SHA-256 over an entry's canonical content, excluding `entry_hash` itself. */
export function computeEntryHash(entry: Omit<AuditEntry, 'entry_hash'>): string {
  return sha256(
    canonicalize({
      seq: entry.seq,
      timestamp: entry.timestamp,
      actor: entry.actor,
      event_type: entry.event_type,
      payload: entry.payload,
      prev_hash: entry.prev_hash,
    }),
  );
}

/** Recompute the chain and report the first break (tamper-evidence). */
export function verifyChain(entries: AuditEntry[]): ChainVerification {
  let prev = GENESIS_HASH;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.seq !== i + 1) {
      return { valid: false, brokenAt: e.seq, reason: 'sequence number out of order' };
    }
    if (e.prev_hash !== prev) {
      return { valid: false, brokenAt: e.seq, reason: 'prev_hash does not match previous entry' };
    }
    if (computeEntryHash(e) !== e.entry_hash) {
      return { valid: false, brokenAt: e.seq, reason: 'entry_hash mismatch (payload tampered)' };
    }
    prev = e.entry_hash;
  }
  return { valid: true };
}
