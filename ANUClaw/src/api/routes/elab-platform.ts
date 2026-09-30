/**
 * E-LAB platform router (Phase 0, WS-D) — Express adapter.
 *
 *   POST /v1/ruo/:engineId            raw engine run (de-id gated, RUO scope)
 *   POST /v1/clinical/drug-combination guarded oncology verdict (clinical gate)
 *
 * Transport only — tenant context resolution and tier gating live in the
 * framework-agnostic service so they are unit-tested without HTTP.
 */

import { Router, Request, Response } from 'express';
import { ElabDeps, runClinicalDrugCombination, runRuo } from '../elab/service';
import { TenantContext } from '../elab/types';

export interface ElabPlatformRouterOptions {
  deps: ElabDeps;
  /** Resolve the tenant context from the request (auth). Null ⇒ 401. */
  resolveContext: (req: Request) => TenantContext | null;
}

export function createElabPlatformRouter(opts: ElabPlatformRouterOptions): Router {
  const { deps, resolveContext } = opts;
  const router = Router();

  router.post('/v1/ruo/:engineId', async (req: Request, res: Response) => {
    const ctx = resolveContext(req);
    if (!ctx) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    const out = await runRuo(deps, ctx, {
      engineId: String(req.params.engineId),
      input: req.body?.input,
      refdb_hashes: req.body?.refdb_hashes,
    });
    res.status(out.status).json(out.body);
  });

  router.post('/v1/clinical/drug-combination', (req: Request, res: Response) => {
    const ctx = resolveContext(req);
    if (!ctx) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    const out = runClinicalDrugCombination(deps, ctx, {
      query: req.body?.query,
      context: req.body?.context,
      supporting: req.body?.supporting,
    });
    res.status(out.status).json(out.body);
  });

  return router;
}
