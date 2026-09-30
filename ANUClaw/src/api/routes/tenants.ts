import { Router, Request, Response } from 'express';
import { registerTenant, Plan, setWebhook, updatePlan } from '../tenant-store';
import { requireAuth, signToken, AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * POST /api/v1/register
 * Register a new company and receive an API key.
 *
 * Body: { company_name, email, plan? }
 */
router.post('/register', async (req: Request, res: Response) => {
  const { company_name, email, plan = 'free' } = req.body;

  if (!company_name || !email) {
    res.status(400).json({ error: 'company_name and email are required.' });
    return;
  }

  const validPlans: Plan[] = ['free', 'pro', 'enterprise'];
  if (!validPlans.includes(plan)) {
    res.status(400).json({ error: `plan must be one of: ${validPlans.join(', ')}` });
    return;
  }

  try {
    const tenant = await registerTenant(company_name, email, plan as Plan);
    res.status(201).json({
      message: 'Registration successful. Store your API key securely — it will not be shown again.',
      tenant_id:    tenant.tenant_id,
      company_name: tenant.company_name,
      plan:         tenant.plan,
      api_key:            tenant.api_key,
      rate_limit_per_min: 'unlimited',
      monthly_quota:      'unlimited',
      docs: 'https://docs.amgi-research.com/api',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Registration failed.';
    res.status(409).json({ error: msg });
  }
});

/**
 * POST /api/v1/token
 * Exchange an API key for a short-lived JWT (1 hour).
 *
 * Header: X-API-Key: amgi_live_...
 */
router.post('/token', requireAuth, (req: AuthRequest, res: Response) => {
  const tenant = req.tenant!;
  const token = signToken(tenant.tenant_id);
  res.json({
    access_token: token,
    token_type:   'Bearer',
    expires_in:   3600,
    tenant_id:    tenant.tenant_id,
    plan:         tenant.plan,
  });
});

/**
 * GET /api/v1/account
 * Get current tenant account info.
 */
router.get('/account', requireAuth, (req: AuthRequest, res: Response) => {
  const t = req.tenant!;
  res.json({
    tenant_id:          t.tenant_id,
    company_name:       t.company_name,
    email:              t.email,
    plan:               t.plan,
    status:             t.status,
    rate_limit_per_min: 'unlimited',
    monthly_quota:      'unlimited',
    usage_this_month:   t.usage_this_month,
    usage_total:        t.usage_total,
    webhook_url:        t.webhook_url,
    created_at:         t.created_at,
    last_active_at:     t.last_active_at,
  });
});

/**
 * PUT /api/v1/account/webhook
 * Register a webhook URL for async skill result delivery.
 *
 * Body: { url }
 */
router.put('/account/webhook', requireAuth, async (req: AuthRequest, res: Response) => {
  const { url } = req.body;
  if (!url || !url.startsWith('https://')) {
    res.status(400).json({ error: 'url must be an HTTPS URL.' });
    return;
  }
  await setWebhook(req.tenant!.tenant_id, url);
  res.json({ message: 'Webhook registered.', url });
});

/**
 * PUT /api/v1/account/plan
 * Upgrade or change plan.
 *
 * Body: { plan }
 */
router.put('/account/plan', requireAuth, async (req: AuthRequest, res: Response) => {
  const { plan } = req.body;
  const validPlans: Plan[] = ['free', 'pro', 'enterprise'];
  if (!validPlans.includes(plan)) {
    res.status(400).json({ error: `plan must be one of: ${validPlans.join(', ')}` });
    return;
  }
  await updatePlan(req.tenant!.tenant_id, plan as Plan);
  res.json({ message: `Plan updated to ${plan}.` });
});

export default router;
