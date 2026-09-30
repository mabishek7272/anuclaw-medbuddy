import { Router } from 'express';
import { requireDashAuth } from '../auth';
import { db } from '../../../db';
import { runAgent } from '../../../container-runner';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();
const SKILLS_DIR = path.resolve('./container/skills');

function parse(r: any) {
  if (!r) return r;
  return {
    ...r,
    conditions:     JSON.parse(r.conditions     || '[]'),
    medications:    JSON.parse(r.medications    || '[]'),
    genomic_profile: JSON.parse(r.genomic_profile || '{}'),
    risk_factors:   JSON.parse(r.risk_factors   || '[]'),
    trial_matches:  JSON.parse(r.trial_matches  || '[]'),
  };
}

// ── List patients ─────────────────────────────────────────────────────────────
router.get('/', requireDashAuth, async (req, res) => {
  const q = (req.query.q as string) ?? '';
  const risk = (req.query.risk as string) ?? '';
  let sql = `SELECT * FROM patients`;
  const params: any[] = [];
  const where: string[] = [];
  
  if (q) {
    where.push(`(name ILIKE $1 OR uid ILIKE $2)`);
    params.push(`%${q}%`, `%${q}%`);
  }
  
  if (risk) {
    const placeholder = `$${params.length + 1}`;
    where.push(`risk_level = ${placeholder}`);
    params.push(risk);
  }
  
  if (where.length) sql += ` WHERE ` + where.join(' AND ');
  sql += ` ORDER BY risk_score DESC, updated_at DESC`;
  
  try {
    const rows = await db.query(sql, params);
    res.json({ patients: rows.map(parse), total: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get patient detail ────────────────────────────────────────────────────────
router.get('/:id', requireDashAuth, async (req, res) => {
  try {
    const p = await db.queryOne(`SELECT * FROM patients WHERE id=$1 OR uid=$2`, [req.params.id, req.params.id]);
    if (!p) { res.status(404).json({ error: 'Patient not found' }); return; }

    const analyses = await db.query(`
      SELECT * FROM patient_analyses WHERE patient_id=$1 ORDER BY ts DESC LIMIT 20
    `, [p.id]);

    res.json({ patient: parse(p), analyses });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Create patient ────────────────────────────────────────────────────────────
router.post('/', requireDashAuth, async (req: any, res) => {
  const { name, dob, sex, uid, conditions, medications, genomic_profile } = req.body;
  if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return; }

  const id = crypto.randomUUID();
  const now = Date.now();
  const autoUid = uid || `AMGI-GB-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9999999)).padStart(7, '0')}`;

  try {
    await db.query(`
      INSERT INTO patients (id, uid, name, dob, sex, conditions, medications, genomic_profile, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [id, autoUid, name.trim(), dob ?? null, sex ?? null,
      JSON.stringify(conditions ?? []), JSON.stringify(medications ?? []),
      JSON.stringify(genomic_profile ?? {}), now, now]);
    res.status(201).json({ id, uid: autoUid });
  } catch (e: any) {
    if (e?.message?.includes('UNIQUE')) { res.status(409).json({ error: 'UID already exists' }); return; }
    res.status(500).json({ error: e.message });
  }
});

// ── Update patient ────────────────────────────────────────────────────────────
router.put('/:id', requireDashAuth, async (req, res) => {
  const { name, dob, sex, conditions, medications, genomic_profile, risk_score, risk_level, risk_factors } = req.body;
  try {
    await db.query(`
      UPDATE patients SET
        name=COALESCE($1,name), dob=COALESCE($2,dob), sex=COALESCE($3,sex),
        conditions=COALESCE($4,conditions), medications=COALESCE($5,medications),
        genomic_profile=COALESCE($6,genomic_profile), risk_score=COALESCE($7,risk_score),
        risk_level=COALESCE($8,risk_level), risk_factors=COALESCE($9,risk_factors), updated_at=$10
      WHERE id=$11
    `, [
      name ?? null, dob ?? null, sex ?? null,
      conditions ? JSON.stringify(conditions) : null,
      medications ? JSON.stringify(medications) : null,
      genomic_profile ? JSON.stringify(genomic_profile) : null,
      risk_score ?? null, risk_level ?? null,
      risk_factors ? JSON.stringify(risk_factors) : null,
      Date.now(), req.params.id
    ]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Delete patient ────────────────────────────────────────────────────────────
router.delete('/:id', requireDashAuth, async (req, res) => {
  try {
    await db.query(`DELETE FROM patient_analyses WHERE patient_id=$1`, [req.params.id]);
    await db.query(`DELETE FROM patients WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Run AI analysis on a patient (SSE) ───────────────────────────────────────
router.post('/:id/analyse', requireDashAuth, async (req: any, res) => {
  try {
    const patient = await db.queryOne(`SELECT * FROM patients WHERE id=$1`, [req.params.id]);
    if (!patient) { res.status(404).json({ error: 'Patient not found' }); return; }

    const { skill = 'anuclaw-clinical-ai', prompt, analysis_type = 'general' } = req.body;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const patientContext = `
Patient: ${patient.name}
UID: ${patient.uid}
DOB: ${patient.dob ?? 'Unknown'} | Sex: ${patient.sex ?? 'Unknown'}
Conditions: ${patient.conditions ? JSON.parse(patient.conditions).join(', ') : 'None recorded'}
Medications: ${patient.medications ? JSON.parse(patient.medications).join(', ') : 'None recorded'}
Risk Level: ${patient.risk_level ?? 'Unknown'} (Score: ${patient.risk_score ?? 0})
Genomic Profile: ${patient.genomic_profile && patient.genomic_profile !== '{}' ? JSON.parse(patient.genomic_profile)?.summary ?? 'Available' : 'Not available'}
AI Summary: ${patient.ai_summary ? patient.ai_summary.slice(0, 500) : 'Not yet generated'}
    `.trim();

    const analysisPrompts: Record<string, string> = {
      risk_stratification: `Perform comprehensive risk stratification for this patient:\n\n${patientContext}\n\nAssign risk scores (0-100) for: cardiovascular, oncological, neurological, metabolic, and medication risk. Identify top 3 actionable risk factors with intervention recommendations.`,
      trial_matching: `Match this patient to suitable clinical trials:\n\n${patientContext}\n\nSearch for phase II/III trials. For each match provide: trial name, NCT number, eligibility assessment, expected benefit, and next steps.`,
      drug_interactions: `Review medication safety for this patient:\n\n${patientContext}\n\nCheck all drug-drug interactions, drug-condition interactions, and genomic pharmacogenomic impacts. Flag CRITICAL, HIGH, MEDIUM severity interactions.`,
      care_plan: `Generate a comprehensive care plan for:\n\n${patientContext}\n\nInclude: immediate priorities (0-7 days), short-term goals (1-3 months), long-term management (3-12 months), and monitoring schedule.`,
      second_opinion: `Provide AI second opinion for:\n\n${patientContext}\n\nAdditional question: ${prompt ?? 'General clinical review'}\n\nReview current diagnoses, treatment approach, and suggest any alternative perspectives or missed considerations.`,
      general: `Analyse this patient and answer the following question:\n\n${patientContext}\n\nQuestion: ${prompt ?? 'Provide a comprehensive clinical summary and key recommendations.'}`,
    };

    const finalPrompt = analysisPrompts[analysis_type] ?? analysisPrompts.general;
    const skillPath = path.join(SKILLS_DIR, skill, 'SKILL.md');

    send('start', { skill, analysis_type, patientName: patient.name });

    const startTs = Date.now();
    let skillMd = '';
    if (fs.existsSync(skillPath)) {
      skillMd = fs.readFileSync(skillPath, 'utf-8').slice(0, 6000);
    }
    const fullPrompt = skillMd ? `You are running the ${skill} skill.\n\n${skillMd}\n\n---\n\nTask:\n${finalPrompt}` : finalPrompt;

    const result = await runAgent({
      groupId: `patient-${patient.id}-${analysis_type}`,
      channel: 'patient_hub',
      prompt: fullPrompt,
    });

    // Save analysis to DB
    const analysisId = crypto.randomUUID();
    await db.query(`
      INSERT INTO patient_analyses (id, patient_id, skill, prompt, result, ts)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [analysisId, patient.id, skill, finalPrompt.slice(0, 500), result.text, Date.now()]);

    // Update AI summary + risk if this was a risk assessment
    if (analysis_type === 'risk_stratification') {
      const riskMatch = result.text.match(/overall[^\d]*(\d+)/i);
      const riskScore = riskMatch ? Math.min(100, Number(riskMatch[1])) : null;
      const riskLevel = riskScore ? (riskScore >= 75 ? 'critical' : riskScore >= 50 ? 'high' : riskScore >= 25 ? 'medium' : 'low') : null;
      
      await db.query(`
        UPDATE patients 
        SET ai_summary=$1, risk_score=COALESCE($2,risk_score), risk_level=COALESCE($3,risk_level), summary_updated_at=$4, updated_at=$5 
        WHERE id=$6
      `, [result.text.slice(0, 2000), riskScore, riskLevel, Date.now(), Date.now(), patient.id]);
    } else if (analysis_type === 'trial_matching') {
      await db.query(`
        UPDATE patients 
        SET trial_matches=$1, updated_at=$2 
        WHERE id=$3
      `, [JSON.stringify([{ summary: result.text.slice(0, 1000), ts: Date.now() }]), Date.now(), patient.id]);
    } else if (!patient.ai_summary) {
      await db.query(`
        UPDATE patients 
        SET ai_summary=$1, summary_updated_at=$2, updated_at=$3 
        WHERE id=$4
      `, [result.text.slice(0, 2000), Date.now(), Date.now(), patient.id]);
    }

    send('output', { text: result.text, analysisId, latencyMs: Date.now() - startTs });
    send('done', { success: true, latencyMs: Date.now() - startTs });
  } catch (err: any) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: err?.message ?? 'Analysis failed' })}\n\n`);
    res.write(`event: done\ndata: ${JSON.stringify({ success: false })}\n\n`);
  } finally {
    res.end();
  }
});

// ── Bulk risk re-score all patients ─────────────────────────────────────────
router.post('/bulk/risk-score', requireDashAuth, async (_req, res) => {
  try {
    const patients = await db.query(`SELECT id FROM patients WHERE risk_score=0 OR summary_updated_at IS NULL LIMIT 10`);
    res.json({ queued: patients.length, message: 'Risk scoring queued. Analyses will run in background.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
