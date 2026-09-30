/**
 * E-LAB console UI router (WS-F).
 *
 *   GET  /v1/elab                 the engine console (public page; calls carry tokens)
 *   POST /v1/elab/demo/clinical   public demo of the oncology Clinical module
 *                                 (stub clinical-granted tenant, seed data — NOT
 *                                 for clinical use; production uses /v1/clinical/*)
 */

import { Router, Request, Response } from 'express';
import { renderElabConsole } from '../elab/console';
import { createDefaultElabPlatform } from '../elab/platform';
import { ElabDeps, runClinicalDrugCombination } from '../elab/service';
import { TenantContext } from '../elab/types';
import { dockFromSmiles } from '../elab/dock-demo';

export function createElabUiRouter(deps: ElabDeps = createDefaultElabPlatform()): Router {
  const router = Router();
  const demoCtx: TenantContext = {
    tenant_id: 'elab-demo',
    scopes: ['ruo', 'clinical'],
    baa_active: true,
    allowed_clinical_domains: ['oncology-combination'],
    residency: 'us',
  };

  router.get('/v1/elab', (_req: Request, res: Response) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
    );
    res.type('html').send(renderElabConsole());
  });

  router.post('/v1/elab/demo/clinical', (req: Request, res: Response) => {
    const out = runClinicalDrugCombination(deps, demoCtx, {
      query: req.body?.query,
      context: req.body?.context,
      supporting: req.body?.supporting,
    });
    res.status(out.status).json(out.body);
  });

  // One-click real docking from SMILES (RUO demo; needs Docker + anuclaw-vina).
  router.post('/v1/elab/demo/dock', async (req: Request, res: Response) => {
    const r = await dockFromSmiles({
      ligand_smiles: req.body?.ligand_smiles,
      receptor_smiles: req.body?.receptor_smiles,
      seed: req.body?.seed,
    });
    if (!r.ok) {
      res.status(502).json({ error: 'docking failed — is Docker running with the anuclaw-vina image?', detail: r.error });
      return;
    }
    res.json({ regulatory: 'RUO — not for diagnostic use', tier: 'ruo', engine: 'docking-vina', result: r.result });
  });

  return router;
}
