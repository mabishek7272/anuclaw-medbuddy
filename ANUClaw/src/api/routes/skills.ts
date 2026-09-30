import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { perTenantRateLimit, quotaCheck } from '../middleware/rate-limit';
import { usageMeter } from '../middleware/usage-meter';
import { runAgent } from '../../container-runner';
import * as path from 'path';
import * as fs from 'fs';

const router = Router();

// ── Available skill catalogue ─────────────────────────────────────────────────
const SKILLS_DIR = path.resolve('./container/skills');

function listSkills(): Array<{ name: string; description: string }> {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  return fs.readdirSync(SKILLS_DIR)
    .filter(d => fs.existsSync(path.join(SKILLS_DIR, d, 'SKILL.md')))
    .map(d => {
      const md = fs.readFileSync(path.join(SKILLS_DIR, d, 'SKILL.md'), 'utf8');
      const title = md.split('\n')[0].replace(/^#+\s*/, '').trim();
      const desc  = md.split('\n').slice(1).find(l => l.trim().length > 0)?.trim() ?? '';
      return { name: d, description: desc || title };
    });
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/skills
 * List all available skills.
 */
router.get('/', requireAuth, (req: AuthRequest, res: Response) => {
  res.json({ skills: listSkills() });
});

/**
 * POST /api/v1/skills/:skill/run
 * Execute a skill with a natural-language prompt.
 *
 * Body:
 *   prompt        {string}  — required. The task/question for the agent.
 *   group_id      {string}  — optional. Persistent session ID (memory is shared across calls with same ID).
 *   max_turns     {number}  — optional, default 5.
 *   stream        {boolean} — optional, default false. Stream newline-delimited JSON chunks.
 */
router.post(
  '/:skill/run',
  requireAuth,
  perTenantRateLimit,
  quotaCheck,
  usageMeter,
  async (req: AuthRequest, res: Response) => {
    const skill = req.params.skill as string;
    const { prompt, group_id, max_turns = 5, stream = false } = req.body;

    if (!prompt) {
      res.status(400).json({ error: 'prompt is required.' });
      return;
    }

    // Validate skill exists
    const skillPath = path.join(SKILLS_DIR, skill, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      res.status(404).json({
        error: `Skill '${skill}' not found.`,
        available: listSkills().map(s => s.name),
      });
      return;
    }

    // Build a tenant-scoped group ID so memory is isolated per tenant
    const scopedGroupId = group_id
      ? `api-${req.tenant!.tenant_id}-${group_id}`
      : `api-${req.tenant!.tenant_id}-${Date.now()}`;

    const skillMd = fs.readFileSync(skillPath, 'utf8');
    const fullPrompt = `You are running the ${skill} skill.\n\n${skillMd}\n\n---\n\nTask:\n${prompt}`;

    try {
      if (stream) {
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Transfer-Encoding', 'chunked');

        // Stream chunks as newline-delimited JSON
        const onChunk = (chunk: string) => {
          res.write(JSON.stringify({ type: 'chunk', text: chunk }) + '\n');
        };

        const result = await runAgent({
          groupId: scopedGroupId,
          prompt:  fullPrompt,
          maxTurns: Number(max_turns),
          onChunk,
        });

        res.write(JSON.stringify({ type: 'done', result, skill, group_id: scopedGroupId }) + '\n');
        res.end();
      } else {
        const result = await runAgent({
          groupId:  scopedGroupId,
          prompt:   fullPrompt,
          maxTurns: Number(max_turns),
        });

        res.json({
          skill,
          group_id:   scopedGroupId,
          result,
          tenant_id:  req.tenant!.tenant_id,
          usage_hint: `${req.tenant!.usage_this_month + 1} calls this month (unlimited)`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Skill execution failed.';
      res.status(500).json({ error: msg, skill });
    }
  },
);

/**
 * POST /api/v1/skills/run
 * Run any skill by specifying it in the body (alternative to path param).
 *
 * Body: { skill, prompt, group_id?, max_turns?, stream? }
 */
router.post(
  '/run',
  requireAuth,
  perTenantRateLimit,
  quotaCheck,
  usageMeter,
  async (req: AuthRequest, res: Response) => {
    if (!req.body.skill) {
      res.status(400).json({ error: 'skill is required in the request body.' });
      return;
    }
    req.params.skill = req.body.skill;
    // Delegate to the /:skill/run handler by re-invoking logic inline
    const { skill } = req.body;
    const { prompt, group_id, max_turns = 5 } = req.body;

    if (!prompt) { res.status(400).json({ error: 'prompt is required.' }); return; }

    const skillPath = path.join(SKILLS_DIR, skill, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      res.status(404).json({ error: `Skill '${skill}' not found.`, available: listSkills().map(s => s.name) });
      return;
    }

    const scopedGroupId = group_id
      ? `api-${req.tenant!.tenant_id}-${group_id}`
      : `api-${req.tenant!.tenant_id}-${Date.now()}`;

    const skillMd = fs.readFileSync(skillPath, 'utf8');
    const fullPrompt = `You are running the ${skill} skill.\n\n${skillMd}\n\n---\n\nTask:\n${prompt}`;

    try {
      const result = await runAgent({ groupId: scopedGroupId, prompt: fullPrompt, maxTurns: Number(max_turns) });
      res.json({ skill, group_id: scopedGroupId, result, tenant_id: req.tenant!.tenant_id });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Skill execution failed.';
      res.status(500).json({ error: msg });
    }
  },
);

export default router;
