import { Router } from 'express';
import { requireDashAuth } from '../auth';
import { db } from '../../../db';
import { runAgent } from '../../../container-runner';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import multer from 'multer';
import { extractTextWithOcr } from '../../../ocr';
const router = Router();
const SKILLS_DIR = path.resolve('./container/skills');

// ── Upload storage ────────────────────────────────────────────────────────────
const upload = multer({
  dest: path.join(os.tmpdir(), 'anuclaw-elab-uploads'),
  limits: { fileSize: 50 * 1024 * 1024, files: 5 },
});

// ── Skill metadata helpers ────────────────────────────────────────────────────
interface SkillMeta {
  name: string;
  title: string;
  description: string;
  domain: string;
  capabilities: string[];
  inputHint: string;
}

function parseDomain(name: string): string {
  if (name.includes('clinical') || name.includes('medical')) return 'Clinical';
  if (name.includes('genomics') || name.includes('protein')) return 'Genomics';
  if (name.includes('drug')) return 'Drug Discovery';
  if (name.includes('ehr') || name.includes('patient')) return 'EHR / PMR';
  if (name.includes('regulatory') || name.includes('compliance') || name.includes('security')) return 'Compliance';
  if (name.includes('nlp') || name.includes('document')) return 'NLP';
  if (name.includes('lab') || name.includes('digital-twin')) return 'Lab';
  return 'General';
}

function parseSkillMd(mdContent: string, skillName: string): SkillMeta {
  const lines = mdContent.split('\n');
  const title = lines[0].replace(/^#+\s*/, '').trim() || skillName;
  const descLine = lines.slice(1).find(l => l.trim().length > 10 && !l.startsWith('#'))?.trim() ?? '';

  // Extract h2/h3 section headings as capabilities
  const capabilities = lines
    .filter(l => /^#{2,3}\s/.test(l))
    .map(l => l.replace(/^#+\s*/, '').trim())
    .filter(c => !c.toLowerCase().includes('example') && !c.toLowerCase().includes('usage'))
    .slice(0, 8);

  // Derive an input hint from common patterns in the SKILL.md
  let inputHint = 'Describe the task or question for this skill…';
  if (skillName.includes('genomics')) inputHint = 'e.g. Analyse BRCA1 c.5266dupC variant in a 45-year-old female…';
  if (skillName.includes('clinical')) inputHint = 'e.g. Patient presents with chest pain and elevated troponin. Suggest differential diagnosis…';
  if (skillName.includes('drug')) inputHint = 'e.g. Identify potential drug candidates targeting EGFR for non-small cell lung cancer…';
  if (skillName.includes('ehr')) inputHint = 'e.g. Register new patient John Smith, DOB 1978-04-12, NHS number 123-456-7890…';
  if (skillName.includes('regulatory')) inputHint = 'e.g. Assess this trial protocol for GCP compliance under ICH E6(R2)…';
  if (skillName.includes('nlp') || skillName.includes('document')) inputHint = 'e.g. Extract all diagnoses and medications from this discharge summary…';
  if (skillName.includes('protein')) inputHint = 'e.g. Predict the 3D structure of this amino acid sequence and identify binding pockets…';
  if (skillName.includes('digital-twin')) inputHint = 'e.g. Simulate medication response for a diabetic patient with CKD stage 3…';
  if (skillName.includes('lab-xr')) inputHint = 'e.g. Interpret CBC results: WBC 14.2, Hgb 8.1, Plt 89 with clinical context…';
  if (skillName.includes('security')) inputHint = 'e.g. Audit access logs for anomalous patterns in the last 24 hours…';

  return {
    name: skillName,
    title,
    description: descLine,
    domain: parseDomain(skillName),
    capabilities,
    inputHint,
  };
}

// ── List all skills with metadata ─────────────────────────────────────────────
router.get('/skills', requireDashAuth, async (_req, res) => {
  if (!fs.existsSync(SKILLS_DIR)) { res.json({ skills: [] }); return; }

  const statsMap = new Map<string, { invocations: number; avg_latency: number; success_rate: number }>();
  try {
    const stats = await db.query(`
      SELECT skill, COUNT(*) as invocations,
             CAST(AVG(latency_ms) AS INTEGER) as avg_latency,
             ROUND(100.0*SUM(CASE WHEN success=1 THEN 1 ELSE 0 END)/COUNT(*),1) as success_rate
      FROM tool_calls GROUP BY skill
    `);
    for (const s of stats) {
      statsMap.set(s.skill, {
        invocations: Number(s.invocations),
        avg_latency: Number(s.avg_latency),
        success_rate: Number(s.success_rate)
      });
    }
  } catch { /* ok */ }

  const skills = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(SKILLS_DIR, d.name, 'SKILL.md')))
    .map(d => {
      const mdContent = fs.readFileSync(path.join(SKILLS_DIR, d.name, 'SKILL.md'), 'utf-8');
      const meta = parseSkillMd(mdContent, d.name);
      const stats = statsMap.get(d.name) ?? { invocations: 0, avg_latency: 0, success_rate: 100 };
      return { ...meta, stats };
    });

  res.json({ skills });
});

// ── Get single skill SKILL.md preview ────────────────────────────────────────
router.get('/skills/:skill', requireDashAuth, (req, res) => {
  const skill = req.params.skill as string;
  const skillPath = path.join(SKILLS_DIR, skill, 'SKILL.md');
  if (!fs.existsSync(skillPath)) { res.status(404).json({ error: 'Skill not found' }); return; }
  const mdContent = fs.readFileSync(skillPath, 'utf-8');
  const meta = parseSkillMd(mdContent, skill);
  // Return first 3000 chars of SKILL.md as preview
  res.json({ ...meta, preview: mdContent.slice(0, 3000) });
});

// ── Run a skill (SSE streaming) ───────────────────────────────────────────────
router.post(
  '/run',
  requireDashAuth,
  upload.array('files', 5),
  async (req: any, res) => {
    const {
      skill,
      prompt,
      compliance_audit  = 'true',
      compliance_pii    = 'false',
      compliance_strict = 'false',
      session_id,
    } = req.body;

    if (!skill || !prompt?.trim()) {
      res.status(400).json({ error: 'skill and prompt are required' });
      return;
    }

    const skillPath = path.join(SKILLS_DIR, skill, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      res.status(404).json({ error: `Skill '${skill}' not found` });
      return;
    }

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const runId = crypto.randomUUID();
    const startTs = Date.now();
    send('start', { runId, skill, ts: startTs });

    // Handle uploaded files — move to a temp workspace dir
    const uploadedFiles: Array<{ name: string; path: string; size: number; mime: string }> = [];
    const files = (req.files ?? []) as any[];
    const workspaceDir = path.join(os.tmpdir(), 'anuclaw-elab', runId);
    if (files.length > 0) {
      fs.mkdirSync(workspaceDir, { recursive: true });
      for (const f of files) {
        const dest = path.join(workspaceDir, f.originalname);
        fs.renameSync(f.path, dest);
        uploadedFiles.push({ name: f.originalname, path: dest, size: f.size, mime: f.mimetype });
        send('file', { name: f.originalname, size: f.size, mime: f.mimetype });
      }
    }

    // Build enriched prompt
    const skillMd = fs.readFileSync(skillPath, 'utf-8');
    const complianceNote = [
      compliance_pii === 'true'    ? '• PII masking mode: redact any identifiable information in your output.' : '',
      compliance_strict === 'true' ? '• Strict compliance mode: flag any regulatory risks before proceeding.' : '',
      compliance_audit === 'true'  ? '• Audit trail: provide a brief reasoning trace with your response.' : '',
    ].filter(Boolean).join('\n');

    const fileContextParts: string[] = [];
    if (uploadedFiles.length > 0) {
      fileContextParts.push(`\\n\\nUploaded files available in ${workspaceDir}:`);
      for (const f of uploadedFiles) {
        fileContextParts.push(`- ${f.name} (${(f.size/1024).toFixed(1)} KB)`);
        try {
          if (f.name.toLowerCase().endsWith('.pdf')) {
            const pdfParse = require('pdf-parse');
            const dataBuffer = fs.readFileSync(f.path);
            const data = await pdfParse(dataBuffer);
            if (data.text.trim().length < 50) {
                console.log(`PDF ${f.name} seems scanned. Falling back to OCR...`);
                const ocrText = await extractTextWithOcr(f.path);
                if (ocrText) {
                    fileContextParts.push(`\n--- START TEXT FROM ${f.name} (OCR) ---\n${ocrText}\n--- END TEXT FROM ${f.name} ---\n`);
                } else {
                    fileContextParts.push(`\n--- START TEXT FROM ${f.name} ---\n${data.text}\n--- END TEXT FROM ${f.name} ---\n`);
                }
            } else {
                fileContextParts.push(`\n--- START TEXT FROM ${f.name} ---\n${data.text}\n--- END TEXT FROM ${f.name} ---\n`);
            }
          } else if (f.name.toLowerCase().match(/\.(png|jpg|jpeg)$/)) {
            const ocrText = await extractTextWithOcr(f.path);
            if (ocrText) {
                 fileContextParts.push(`\n--- START TEXT FROM ${f.name} (OCR) ---\n${ocrText}\n--- END TEXT FROM ${f.name} ---\n`);
            } else {
                 fileContextParts.push(`\n--- ${f.name} (Image attached, but OCR failed) ---\n`);
            }
          } else if (f.name.toLowerCase().match(/\.(txt|csv|md)$/)) {
             const text = fs.readFileSync(f.path, 'utf-8');
             fileContextParts.push(`\n--- START TEXT FROM ${f.name} ---\n${text}\n--- END TEXT FROM ${f.name} ---\n`);
          }
        } catch (err) {
          console.error(`Failed to parse file ${f.name}:`, err);
        }
      }
    }
    const fileContext = fileContextParts.join('\\n');

    const fullPrompt = [
      `You are running the ${skill} skill.\n`,
      skillMd.slice(0, 8000),
      '---',
      complianceNote ? `Compliance directives:\n${complianceNote}\n` : '',
      fileContext ? fileContext + '\n' : '',
      '---\n',
      `Task:\n${prompt.trim()}`,
    ].filter(Boolean).join('\n');

    const groupId = session_id
      ? `elab-${req.user.id}-${session_id}`
      : `elab-${req.user.id}-${runId}`;

    let success = false;

    try {
      const result = await runAgent({
        groupId,
        channel: 'elab',
        prompt: fullPrompt,
        mediaPath: uploadedFiles[0]?.path,
        mediaType: uploadedFiles.length > 0 ? 'document' : undefined,
      });

      success = !result.error;

      send('output', { text: result.text });

      if (result.artifacts?.length > 0) {
        send('artifacts', { files: result.artifacts });
      }

      send('done', {
        runId,
        skill,
        latencyMs: Date.now() - startTs,
        success: !result.error,
        error: result.error,
      });
    } catch (err: any) {
      const msg = err?.message ?? 'Skill execution failed';
      send('error', { message: msg });
      send('done', { runId, skill, latencyMs: Date.now() - startTs, success: false, error: msg });
    } finally {
      // Log to tool_calls for stats
      try {
        await db.query(`
          INSERT INTO tool_calls (group_id, skill, latency_ms, success, ts)
          VALUES ($1, $2, $3, $4, $5)
        `, [groupId, skill, Date.now() - startTs, success ? 1 : 0, startTs]);
      } catch { /* ok */ }

      // Audit log
      if (compliance_audit === 'true') {
        try {
          await db.query(`
            INSERT INTO audit_events (ts, action, actor_id, actor_type, channel, group_id, target_type, target_id, meta)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            startTs, 'elab.run',
            req.user.id, 'dashboard_user', 'elab',
            groupId, 'skill', skill,
            JSON.stringify({ prompt: prompt.slice(0, 200), files: uploadedFiles.map(f => f.name), runId }),
          ]);
        } catch { /* ok */ }
      }

      // Clean up temp files
      try { if (files.length > 0) fs.rmSync(workspaceDir, { recursive: true, force: true }); } catch { /* ok */ }
      res.end();
    }
  },
);

export default router;
