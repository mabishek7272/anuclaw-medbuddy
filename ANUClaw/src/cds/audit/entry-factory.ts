/**
 * Shared audit-entry construction (used by both the sync and async logs).
 *
 * Keeping the hash-chain construction and the 21 CFR Part 11 sign-off payload in
 * one pure place guarantees the in-memory/file logs and the Postgres-backed log
 * produce byte-identical, verifiable chains.
 */

import { GENESIS_HASH, computeEntryHash } from './hash-chain';
import { AuditEntry, SignOffParams, SignOffPayload } from './types';

export const RETENTION_YEARS = 7; // aligned to clinical-records requirements (§5.4)

export interface RecordInput {
  actor: string;
  event_type: string;
  payload: unknown;
}

/** Build the next hash-chained entry given the current head (or null). */
export function buildNextEntry(
  prev: AuditEntry | null,
  input: RecordInput,
  now: Date,
): AuditEntry {
  const base: Omit<AuditEntry, 'entry_hash'> = {
    seq: (prev?.seq ?? 0) + 1,
    timestamp: now.toISOString(),
    actor: input.actor,
    event_type: input.event_type,
    payload: input.payload,
    prev_hash: prev?.entry_hash ?? GENESIS_HASH,
  };
  return { ...base, entry_hash: computeEntryHash(base) };
}

export function describeAction(action: SignOffParams['action']): string {
  switch (action) {
    case 'accept':
      return 'accepted';
    case 'accept_with_modification':
      return 'accepted with modification';
    case 'reject':
      return 'rejected (overrode)';
  }
}

/**
 * Validate a clinician sign-off and build its record input. A modification or
 * override REQUIRES a structured reason (plan §5.3).
 */
export function buildSignOffInput(params: SignOffParams, now: Date): RecordInput {
  if (params.action !== 'accept' && !params.override_reason?.trim()) {
    throw new Error(
      `A structured override_reason is required for action '${params.action}'.`,
    );
  }
  const meaning = `Clinician ${params.clinician.id} reviewed and ${describeAction(
    params.action,
  )} the recommendation.`;
  const payload: SignOffPayload = {
    verdict_hash: params.verdict_hash,
    clinician_id: params.clinician.id,
    clinician_name: params.clinician.name,
    action: params.action,
    meaning,
    override_reason: params.override_reason,
    signed_at: now.toISOString(),
  };
  return {
    actor: `clinician:${params.clinician.id}`,
    event_type: 'clinician.signoff',
    payload,
  };
}
