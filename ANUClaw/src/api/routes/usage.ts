import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getUsageStats } from '../tenant-store';

const router = Router();

/**
 * GET /api/v1/usage
 * Returns usage statistics for the authenticated tenant.
 */
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const stats = await getUsageStats(req.tenant!.tenant_id);
    res.json(stats);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch usage.' });
  }
});

export default router;
