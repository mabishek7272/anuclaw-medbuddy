/**
 * CDS v3 routes — wires the deterministic CDS engine into the running API server
 * with a durable, Postgres-backed, hash-chained audit log (plan §5.4, §6.3).
 *
 *   GET  /cds-services                  CDS Hooks discovery
 *   POST /cds-services/:id              CDS Hooks invocation (order-sign)
 *   POST /cds/review/evaluate           run the pipeline for an order
 *   POST /cds/review/signoff            record a clinician sign-off (e-signature)
 *   GET  /cds/review/audit/export       signed audit bundle
 *   GET  /cds/review/audit/verify       chain verification
 *   GET  /cds/review/demo               rendered clinician review page
 *
 * Every evaluation is recorded to the shared audit log BEFORE its result is
 * returned, so an audit-write failure surfaces as a 500 and no card is emitted
 * (plan §3.2). The async path is required because the chain reads the prior head
 * from Postgres before each append.
 *
 * NOTE: SMART on FHIR OAuth2 / dashboard auth must sit in front of these routes
 * in production (plan §6.5); this router performs no authn/authz.
 */

import { Router, Request, Response } from 'express';
import { getDb } from '../../db/connection';
import { logger } from '../../logger';
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
  SERVICE_ID,
  DEMO_REQUEST,
} from '../../cds';
import type { CdsAuthConfig, CdsHookRequest, ReviewItem, SignOffParams } from '../../cds';
import {
  cdsAuthConfigFromEnv,
  cdsHooksAuthHardened,
  smartScopeAuthHardened,
} from '../middleware/cds-auth';

const SUPPORTED_HOOKS = new Set(['order-sign', 'order-select']);

export interface CdsRouterDeps {
  /** Inject a pool (tests); defaults to the app's pg pool via getDb(). */
  pool?: PgPoolLike;
  /** Auth config; defaults to env. */
  auth?: CdsAuthConfig;
}

export function createCdsRouter(deps: CdsRouterDeps = {}): Router {
  const pool: PgPoolLike = deps.pool ?? wrapAppPool();
  const sink = new PostgresAuditSink(pool);
  const auditLog = new AsyncAuditLog(sink);
  const auth = deps.auth ?? cdsAuthConfigFromEnv();

  if (!auth.enabled) {
    logger.warn(
      'CDS endpoints are UNAUTHENTICATED — set CDS_JWT_PUBLIC_KEY (or CDS_JWT_SECRET) ' +
        'and CDS_AUDIENCE/CDS_TRUSTED_ISSUERS to enable SMART on FHIR / CDS Hooks auth (§6.5).',
    );
  }

  // Hardened (async, JWKS-capable) guards; behaviour is identical to the sync
  // guards when no JWKS / requireAsymmetric is configured (WS-C5).
  const hooksGuard = cdsHooksAuthHardened(auth);
  const readGuard = smartScopeAuthHardened(auth, auth.requiredScopes);
  const signOffGuard = smartScopeAuthHardened(auth, [...auth.requiredScopes, ...auth.signOffScopes]);

  // Ensure the append-only schema exists exactly once (lazy, idempotent).
  let schemaReady: Promise<void> | null = null;
  const ensureSchema = () => (schemaReady ??= sink.ensureSchema());

  async function recordItems(items: EvaluationItem[], patientUid: string): Promise<void> {
    for (const item of items) {
      for (const input of eventInputsFor(
        item.verdict,
        item.explanation,
        item.trace,
        item.gene,
        patientUid,
      )) {
        await auditLog.record(input); // rejects on write failure → 500, no card
      }
    }
  }

  const router = Router();

  // ── CDS Hooks ────────────────────────────────────────────────────────────
  // Discovery is public per the CDS Hooks spec (EHRs fetch it unauthenticated).
  router.get('/cds-services', (_req: Request, res: Response) => {
    res.json({ services: [cdsServiceDescriptor()] });
  });

  // Invocation requires the EHR-issued CDS Hooks JWT.
  router.post('/cds-services/:id', hooksGuard, async (req: Request, res: Response) => {
    if (req.params.id !== SERVICE_ID) {
      res.status(404).json({ error: `Unknown CDS service '${req.params.id}'` });
      return;
    }
    const body = req.body as CdsHookRequest;
    if (!body || typeof body.hook !== 'string' || !body.context) {
      res.status(400).json({ error: 'Invalid CDS Hooks request' });
      return;
    }
    if (!SUPPORTED_HOOKS.has(body.hook)) {
      res.json({ cards: [] });
      return;
    }
    try {
      await ensureSchema();
      const items = await evaluateRequest(body, {});
      await recordItems(items, body.context.patientId ?? 'unknown-patient');
      res.json({ cards: items.map((i) => i.card) });
    } catch (err) {
      fail(res, err);
    }
  });

  // ── Clinician review (SMART access token + scopes) ─────────────────────────
  router.post('/cds/review/evaluate', readGuard, async (req: Request, res: Response) => {
    const body = req.body as CdsHookRequest;
    try {
      await ensureSchema();
      const items = await evaluateRequest(body, {});
      const patientId = body.context?.patientId ?? 'unknown-patient';
      await recordItems(items, patientId);
      res.json({ patientId, items: items.map(toReviewItem) });
    } catch (err) {
      fail(res, err);
    }
  });

  router.post('/cds/review/signoff', signOffGuard, async (req: Request, res: Response) => {
    try {
      await ensureSchema();
      const entry = await auditLog.signOff(req.body as SignOffParams);
      res.json({ entry });
    } catch (err) {
      // Missing override reason etc. → client error.
      res.status(400).json({ error: msg(err) });
    }
  });

  router.get('/cds/review/audit/export', readGuard, async (_req: Request, res: Response) => {
    try {
      await ensureSchema();
      res.json(await auditLog.export());
    } catch (err) {
      fail(res, err);
    }
  });

  router.get('/cds/review/audit/verify', readGuard, async (_req: Request, res: Response) => {
    try {
      await ensureSchema();
      res.json(await auditLog.verify());
    } catch (err) {
      fail(res, err);
    }
  });

  // Empty console — the clinician runs evaluations from the form.
  router.get('/cds/review', readGuard, (_req: Request, res: Response) => {
    sendConsole(res, []);
  });

  // Preloaded console — a sample order is evaluated and rendered.
  router.get('/cds/review/demo', readGuard, async (_req: Request, res: Response) => {
    try {
      await ensureSchema();
      const items = await evaluateRequest(DEMO_REQUEST, {});
      await recordItems(items, 'demo-patient-001');
      sendConsole(res, items.map(toReviewItem));
    } catch (err) {
      fail(res, err);
    }
  });

  return router;
}

/** Serve the review console, relaxing helmet's CSP for its inline script/style. */
function sendConsole(res: Response, items: ReviewItem[]): void {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
  );
  res.type('html').send(renderReviewPage(items));
}

/** Adapt the app's pg Pool to the minimal PgPoolLike the sink needs. */
function wrapAppPool(): PgPoolLike {
  const pool = getDb();
  return { query: (text, params) => pool.query(text, params as unknown[]) };
}

function fail(res: Response, err: unknown): void {
  logger.error(`CDS route error: ${msg(err)}`);
  res.status(500).json({ error: 'CDS evaluation failed', detail: msg(err) });
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default createCdsRouter;
