/**
 * Express adapter for the CDS Hooks service (plan §6.3).
 *
 * A thin transport layer over the framework-agnostic `handleHook`. Mount it on
 * the app to expose the standard CDS Hooks endpoints:
 *   GET  /cds-services            → discovery
 *   POST /cds-services/:id        → invocation
 *
 * NOTE: production deployment must add SMART on FHIR OAuth2 with least-privilege
 * scopes, TLS, and request authentication (plan §6.5); this adapter is the
 * transport only and performs no authn/authz.
 */

import { Router, Request, Response } from 'express';
import { CdsHookRequest } from '../fhir/types';
import {
  HandleHookOptions,
  SERVICE_ID,
  cdsServiceDescriptor,
  handleHook,
} from './cds-hooks';

export function createCdsHooksRouter(options: HandleHookOptions = {}): Router {
  const router = Router();

  // Discovery
  router.get('/cds-services', (_req: Request, res: Response) => {
    res.json({ services: [cdsServiceDescriptor()] });
  });

  // Invocation
  router.post('/cds-services/:id', async (req: Request, res: Response) => {
    if (req.params.id !== SERVICE_ID) {
      res.status(404).json({ error: `Unknown CDS service '${req.params.id}'` });
      return;
    }
    const body = req.body as CdsHookRequest;
    if (!body || typeof body.hook !== 'string' || !body.context) {
      res.status(400).json({ error: 'Invalid CDS Hooks request' });
      return;
    }
    try {
      const response = await handleHook(body, options);
      res.json(response);
    } catch (err) {
      // Fail closed: never emit a partial/guessed card on internal error.
      res.status(500).json({
        error: 'CDS evaluation failed',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}
