/**
 * Canonical, deterministic hashing for CDS data files.
 *
 * Every gene table and rule table carries an integrity hash so that a
 * recommendation can be reproduced from the audit log alone (plan §4.1.3),
 * and so that an uncontrolled edit to a data file is detected and the
 * pipeline fails closed (plan §3.3 "Rule table version mismatch -> Halt").
 */

import * as crypto from 'crypto';

/** Recursively sort object keys so serialisation is order-independent. */
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue(obj[key]);
        return acc;
      }, {});
  }
  return value;
}

/** Deterministic JSON string with sorted keys. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/** SHA-256 over the canonical form of a value — stable across key ordering. */
export function contentHash(value: unknown): string {
  return sha256(canonicalize(value));
}
