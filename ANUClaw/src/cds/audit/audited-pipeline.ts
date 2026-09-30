/**
 * Audited pipeline (plan §3.1, §3.2).
 *
 * Runs the full master pipeline (stages 4–14), then writes every stage event,
 * the full verdict, and the explanation outcome to the hash-chained audit log.
 * If ANY audit write fails, the error propagates and the caller HALTS — no
 * clinical output is returned without a complete audit record (plan §3.2).
 *
 * (In production the per-stage writes are interleaved so each event is durable
 * before control passes; here they are written as one atomic post-run batch.)
 */

import {
  AuditEvent,
  FullPipelineRequest,
  FullPipelineResult,
  runPipelineWithExplanation,
} from '../pipeline';
import { Verdict } from '../safety/types';
import { ExplanationResult } from '../explanation/types';
import { AuditLog } from './audit-log';
import { AsyncAuditLog } from './async-audit-log';
import { RecordInput } from './entry-factory';
import { AuditEntry } from './types';

export interface AuditedPipelineResult extends FullPipelineResult {
  audit: AuditEntry[];
}

export async function runAuditedPipeline(
  req: FullPipelineRequest,
  log: AuditLog,
): Promise<AuditedPipelineResult> {
  const result = await runPipelineWithExplanation(req);
  recordResult(log, result, req.gene, req.snapshot.uid);
  return { ...result, audit: log.entries() };
}

/** Async variant for durable backends (e.g. Postgres). */
export async function runAuditedPipelineAsync(
  req: FullPipelineRequest,
  log: AsyncAuditLog,
): Promise<AuditedPipelineResult> {
  const result = await runPipelineWithExplanation(req);
  for (const input of resultRecordInputs(result, req.gene, req.snapshot.uid)) {
    await log.record(input); // sequential — the chain depends on the prior head
  }
  return { ...result, audit: await log.entries() };
}

/** The ordered audit events for a verdict + explanation + trace. */
export function eventInputsFor(
  verdict: Verdict,
  explanation: ExplanationResult,
  trace: AuditEvent[],
  gene: string,
  patientUid: string,
): RecordInput[] {
  const inputs: RecordInput[] = trace.map((ev) => ({
    actor: `system:stage-${ev.stage}`,
    event_type: ev.event,
    payload: { status: ev.status, gene, patient: patientUid },
  }));
  // Full verdict for reproducibility, and the explanation outcome.
  inputs.push({
    actor: 'system:arbitrator',
    event_type: 'verdict.recorded',
    payload: verdict,
  });
  inputs.push({
    actor: 'system:explanation',
    event_type: 'explanation.recorded',
    payload: {
      status: explanation.status,
      narrative: explanation.narrative,
      consistency: explanation.consistency,
      escalate_to_human: explanation.escalate_to_human,
    },
  });
  return inputs;
}

/** The ordered audit events for a pipeline result (shared by sync + async). */
export function resultRecordInputs(
  result: FullPipelineResult,
  gene: string,
  patientUid: string,
): RecordInput[] {
  return eventInputsFor(
    result.verdict,
    result.explanation,
    result.trace,
    gene,
    patientUid,
  );
}

/** Write a pipeline result's events to the audit log (throws on sink failure). */
export function recordResult(
  log: AuditLog,
  result: FullPipelineResult,
  gene: string,
  patientUid: string,
): void {
  for (const input of resultRecordInputs(result, gene, patientUid)) {
    log.record(input);
  }
}
