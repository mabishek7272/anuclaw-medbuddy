/**
 * Dashboard-mounted CDS surface (plan §5.3, §6.3).
 *
 * Exposes the CDS engine inside the dashboard with the dashboard's own cookie
 * session auth (`requireDashAuth`) instead of SMART/CDS-Hooks JWTs, so the SPA
 * can call it same-origin. It shares the SAME Postgres-backed, hash-chained
 * audit log as the API server (one `cds_audit_log` table → one continuous chain).
 *
 *   GET  /cds-embed            light-theme console (iframed by the SPA page)
 *   POST /api/cds/evaluate     run the pipeline for an order
 *   POST /api/cds/signoff      clinician sign-off (attributed to the dash user)
 *   GET  /api/cds/audit/verify chain verification
 *   GET  /api/cds/audit/export signed audit bundle
 *   GET  /api/cds/service      CDS Hooks discovery descriptor
 */

import express, { Response } from 'express';
import { AuthRequest, requireDashAuth, requireRole } from '../auth';
import { getDb } from '../../../db';
import {
  AsyncAuditLog,
  PostgresAuditSink,
  PgPoolLike,
  EvaluationItem,
  evaluateRequest,
  eventInputsFor,
  toReviewItem,
  renderReviewPage,
  cdsServiceDescriptor,
} from '../../../cds';
import type { CdsHookRequest, SignOffParams } from '../../../cds';

const API_BASE = '/api/cds';

let auditLog: AsyncAuditLog | null = null;
let schemaReady: Promise<void> | null = null;

function getLog(): AsyncAuditLog {
  if (!auditLog) {
    const pool: PgPoolLike = { query: (text, params) => getDb().query(text, params as unknown[]) };
    const sink = new PostgresAuditSink(pool);
    schemaReady = sink.ensureSchema();
    auditLog = new AsyncAuditLog(sink);
  }
  return auditLog;
}

async function ensure(): Promise<void> {
  getLog();
  if (schemaReady) await schemaReady;
}

async function recordItems(items: EvaluationItem[], patientUid: string): Promise<void> {
  const log = getLog();
  for (const item of items) {
    for (const input of eventInputsFor(item.verdict, item.explanation, item.trace, item.gene, patientUid)) {
      await log.record(input);
    }
  }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function mountDashboardCds(dash: express.Router): void {
  // Embedded console — cookie-auth, calls the /api/cds endpoints, no token field.
  dash.get('/cds-embed', requireDashAuth, (req: AuthRequest, res: Response) => {
    const who = req.user?.email ?? req.user?.id ?? 'clinician';
    res.type('html').send(
      renderReviewPage([], who, {
        apiBase: API_BASE,
        servicePath: API_BASE + '/service',
        showToken: false,
      }),
    );
  });

  const api = express.Router();
  api.use(requireDashAuth);

  api.post('/evaluate', async (req: AuthRequest, res: Response) => {
    try {
      await ensure();
      const body = req.body as CdsHookRequest;
      const items = await evaluateRequest(body, {});
      const patientId = body?.context?.patientId ?? 'unknown-patient';
      await recordItems(items, patientId);
      res.json({ patientId, items: items.map(toReviewItem) });
    } catch (err) {
      res.status(500).json({ error: msg(err) });
    }
  });

  // Sign-off is a clinical action → restrict by role; attribute to the dash user.
  api.post('/signoff', requireRole('admin', 'operator', 'compliance'), async (req: AuthRequest, res: Response) => {
    try {
      await ensure();
      const params = req.body as SignOffParams;
      if (req.user) {
        params.clinician = { id: req.user.email ?? req.user.id, name: req.user.name ?? undefined };
      }
      const entry = await getLog().signOff(params);
      res.json({ entry });
    } catch (err) {
      res.status(400).json({ error: msg(err) });
    }
  });

  api.get('/audit/verify', async (_req: AuthRequest, res: Response) => {
    try {
      await ensure();
      res.json(await getLog().verify());
    } catch (err) {
      res.status(500).json({ error: msg(err) });
    }
  });

  api.get('/audit/export', requireRole('admin', 'auditor', 'compliance'), async (_req: AuthRequest, res: Response) => {
    try {
      await ensure();
      res.json(await getLog().export());
    } catch (err) {
      res.status(500).json({ error: msg(err) });
    }
  });

  api.get('/service', (_req: AuthRequest, res: Response) => {
    res.json({ services: [cdsServiceDescriptor()] });
  });

  dash.use(API_BASE, api);
}
