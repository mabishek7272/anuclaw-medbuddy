/**
 * Express router for the clinician review surface (plan §5.3).
 *
 *   POST /cds/review/evaluate     → { items }  (run the pipeline for an order)
 *   POST /cds/review/signoff      → { entry }  (record Accept/Modify/Reject)
 *   GET  /cds/review/audit/export → signed audit bundle
 *   GET  /cds/review/demo         → rendered review page for a sample order
 *
 * The router shares ONE AuditLog across evaluate + signoff + export, so the
 * sign-off chains onto the same tamper-evident log as the decision it signs.
 *
 * NOTE: production must add SMART on FHIR / dashboard auth in front of these
 * routes (plan §6.5); this adapter performs no authn/authz.
 */

import { Router, Request, Response } from 'express';
import { AuditLog } from '../audit/audit-log';
import { BundleSigner, SignOffParams } from '../audit/types';
import { CdsHookRequest } from '../fhir/types';
import { HandleHookOptions } from '../hooks/cds-hooks';
import { evaluateForReview, submitSignOff } from './review-service';
import { renderReviewPage } from './page';
import { DEMO_REQUEST } from './demo-fixture';

export interface ReviewRouterOptions extends HandleHookOptions {
  /** Shared audit log; one is created if omitted. */
  auditLog?: AuditLog;
  /** Optional signer for the export bundle. */
  signer?: BundleSigner;
}

export function createClinicianReviewRouter(options: ReviewRouterOptions = {}): Router {
  const router = Router();
  const log = options.auditLog ?? new AuditLog();
  const evalOptions: HandleHookOptions = { ...options, auditLog: log };

  router.post('/cds/review/evaluate', async (req: Request, res: Response) => {
    try {
      const evaluation = await evaluateForReview(req.body as CdsHookRequest, evalOptions);
      res.json(evaluation);
    } catch (err) {
      res.status(500).json({ error: 'evaluation failed', detail: msg(err) });
    }
  });

  router.post('/cds/review/signoff', (req: Request, res: Response) => {
    try {
      const entry = submitSignOff(req.body as SignOffParams, log);
      res.json({ entry });
    } catch (err) {
      // Missing override reason etc. → 400 (client must fix), not 500.
      res.status(400).json({ error: msg(err) });
    }
  });

  router.get('/cds/review/audit/export', (_req: Request, res: Response) => {
    res.json(log.export(options.signer));
  });

  router.get('/cds/review/demo', async (_req: Request, res: Response) => {
    const evaluation = await evaluateForReview(DEMO_REQUEST, evalOptions);
    res.type('html').send(renderReviewPage(evaluation.items));
  });

  return router;
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
