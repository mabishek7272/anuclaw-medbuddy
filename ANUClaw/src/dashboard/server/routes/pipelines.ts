import { Router } from 'express';
import { requireDashAuth } from '../auth';
import { db } from '../../../db';
import { runAgent } from '../../../container-runner';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();
const SKILLS_DIR = path.resolve('./container/skills');

// ── Types ─────────────────────────────────────────────────────────────────────
interface PipelineNode {
  id: string;
  skill: string;
  label: string;
  prompt_template: string; // may contain {{input}}, {{node_X.output}}, {{patient_uid}}, etc.
  position?: { x: number; y: number };
}

interface Pipeline {
  id: string;
  name: string;
  description: string;
  category: string;
  nodes: PipelineNode[];
  connections: Array<{ from: string; to: string }>;
  trigger_type: string;
  created_by: string;
  created_at: number;
  run_count: number;
  last_run_at: number | null;
}

// ── Built-in pipeline templates ──────────────────────────────────────────────
const TEMPLATES: Omit<Pipeline, 'id' | 'created_by' | 'created_at' | 'run_count' | 'last_run_at'>[] = [
  {
    name: 'Genomic Risk Report',
    description: 'Full variant analysis → clinical significance → drug interactions → PDF-ready report',
    category: 'genomics',
    trigger_type: 'manual',
    nodes: [
      { id: 'n1', skill: 'anuclaw-genomics',     label: 'Variant Analysis',   prompt_template: 'Analyse this genomic variant or VCF data:\n\n{{input}}\n\nIdentify all clinically significant variants, ACMG classifications, and associated conditions.' },
      { id: 'n2', skill: 'anuclaw-clinical',     label: 'Clinical Significance', prompt_template: 'Given these genomic findings:\n\n{{n1.output}}\n\nProvide clinical significance assessment, penetrance estimates, and recommended follow-up actions.' },
      { id: 'n3', skill: 'anuclaw-drug-discovery', label: 'Pharmacogenomics',  prompt_template: 'Based on this genomic and clinical profile:\n\n{{n2.output}}\n\nIdentify relevant pharmacogenomic implications, drug metabolism impacts, and contraindications.' },
      { id: 'n4', skill: 'anuclaw-medical-nlp',  label: 'Report Generation',  prompt_template: 'Generate a formal clinical genomics report from these findings:\n\nVariant Analysis:\n{{n1.output}}\n\nClinical Assessment:\n{{n2.output}}\n\nPharmacogenomics:\n{{n3.output}}\n\nFormat as a structured clinical document with executive summary, findings, and recommendations.' },
    ],
    connections: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }, { from: 'n3', to: 'n4' }],
  },
  {
    name: 'Patient Admission Workflow',
    description: 'Intake → EHR registration → risk stratification → care plan generation',
    category: 'clinical',
    trigger_type: 'manual',
    nodes: [
      { id: 'n1', skill: 'anuclaw-ehr-patient',  label: 'EHR Registration',   prompt_template: 'Register or retrieve this patient in the EHR system:\n\n{{input}}\n\nReturn patient UID, demographics, and existing conditions.' },
      { id: 'n2', skill: 'anuclaw-clinical',     label: 'Clinical Assessment', prompt_template: 'Perform initial clinical risk assessment for:\n\n{{n1.output}}\n\nAssign risk level (LOW/MEDIUM/HIGH/CRITICAL), identify immediate concerns, and flag any red flags.' },
      { id: 'n3', skill: 'anuclaw-clinical-ai',  label: 'Differential Dx',    prompt_template: 'Generate differential diagnosis for:\n\n{{n2.output}}\n\nList top 5 diagnoses with probability estimates and required investigations.' },
      { id: 'n4', skill: 'anuclaw-regulatory',   label: 'Compliance Check',   prompt_template: 'Review this admission for regulatory compliance:\n\n{{n3.output}}\n\nCheck HIPAA data handling, consent requirements, and mandatory reporting obligations.' },
    ],
    connections: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }, { from: 'n3', to: 'n4' }],
  },
  {
    name: 'Drug Discovery Screen',
    description: 'Target identification → compound screening → ADMET prediction → lead ranking',
    category: 'drug_discovery',
    trigger_type: 'manual',
    nodes: [
      { id: 'n1', skill: 'anuclaw-drug-discovery', label: 'Target Analysis',    prompt_template: 'Analyse this disease target or mechanism:\n\n{{input}}\n\nIdentify druggable binding sites, known inhibitors/activators, and structural features.' },
      { id: 'n2', skill: 'anuclaw-protein',        label: 'Structure Analysis', prompt_template: 'Perform protein structure analysis for the target identified here:\n\n{{n1.output}}\n\nPredict binding pockets, allosteric sites, and structural dynamics.' },
      { id: 'n3', skill: 'anuclaw-drug-discovery', label: 'Compound Screen',    prompt_template: 'Screen for candidate compounds against this target profile:\n\n{{n2.output}}\n\nIdentify top 10 candidates with binding affinity estimates, selectivity profiles, and novelty assessment.' },
      { id: 'n4', skill: 'anuclaw-drug-discovery', label: 'ADMET Prediction',   prompt_template: 'Predict ADMET properties for these lead candidates:\n\n{{n3.output}}\n\nFor each compound: absorption, distribution, metabolism, excretion, toxicity predictions and developability score.' },
    ],
    connections: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }, { from: 'n3', to: 'n4' }],
  },
  {
    name: 'Clinical Trial Matching',
    description: 'Patient profile extraction → eligibility scoring → trial ranking → outreach draft',
    category: 'clinical',
    trigger_type: 'manual',
    nodes: [
      { id: 'n1', skill: 'anuclaw-ehr-patient',   label: 'Profile Extraction', prompt_template: 'Extract comprehensive clinical profile for trial matching:\n\n{{input}}\n\nReturn: diagnoses, stage/severity, biomarkers, prior treatments, performance status, exclusion criteria risk factors.' },
      { id: 'n2', skill: 'anuclaw-clinical-ai',   label: 'Trial Eligibility',  prompt_template: 'Identify matching clinical trials for this patient profile:\n\n{{n1.output}}\n\nSearch for phase II/III trials, assess inclusion/exclusion criteria, rank by relevance and patient benefit.' },
      { id: 'n3', skill: 'anuclaw-regulatory',    label: 'Regulatory Review',  prompt_template: 'Review regulatory requirements for trial participation:\n\n{{n2.output}}\n\nCheck consent requirements, protocol compliance, and reporting obligations for top matching trials.' },
      { id: 'n4', skill: 'anuclaw-medical-nlp',   label: 'Patient Brief',      prompt_template: 'Generate a patient-friendly summary of trial options:\n\n{{n3.output}}\n\nWrite in plain language (reading age 12), include what to expect, potential benefits/risks, and next steps.' },
    ],
    connections: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }, { from: 'n3', to: 'n4' }],
  },
  {
    name: 'Regulatory Compliance Audit',
    description: 'Document review → gap analysis → risk scoring → remediation roadmap',
    category: 'compliance',
    trigger_type: 'manual',
    nodes: [
      { id: 'n1', skill: 'anuclaw-regulatory',      label: 'Document Review',  prompt_template: 'Review this document or process description for regulatory compliance:\n\n{{input}}\n\nIdentify applicable regulations (GCP, HIPAA, GDPR, FDA, EMA) and current compliance status.' },
      { id: 'n2', skill: 'anuclaw-security-advanced', label: 'Security Audit', prompt_template: 'Perform security and data governance audit based on:\n\n{{n1.output}}\n\nIdentify data handling risks, access control gaps, encryption requirements, and breach scenarios.' },
      { id: 'n3', skill: 'anuclaw-regulatory',      label: 'Gap Analysis',     prompt_template: 'Produce formal gap analysis from these findings:\n\nRegulatory: {{n1.output}}\n\nSecurity: {{n2.output}}\n\nFor each gap: regulation, current state, required state, risk level (CRITICAL/HIGH/MEDIUM/LOW), remediation effort.' },
      { id: 'n4', skill: 'anuclaw-medical-nlp',     label: 'Remediation Plan', prompt_template: 'Create executive remediation roadmap from this gap analysis:\n\n{{n3.output}}\n\nPrioritised action plan with: quick wins (0-30 days), medium-term (30-90 days), strategic (90+ days). Include resource estimates.' },
    ],
    connections: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }, { from: 'n3', to: 'n4' }],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)?)\}\}/g, (_, key) => vars[key] ?? `[${key} not available]`);
}

function row2pipeline(r: any): any {
  return {
    ...r,
    nodes: JSON.parse(r.nodes || '[]'),
    connections: JSON.parse(r.connections || '[]'),
  };
}

// ── List pipelines + templates ────────────────────────────────────────────────
router.get('/', requireDashAuth, async (_req, res) => {
  try {
    const rows = await db.query(`SELECT * FROM pipelines ORDER BY created_at DESC`);
    res.json({
      pipelines: rows.map(row2pipeline),
      templates: TEMPLATES,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Create pipeline ───────────────────────────────────────────────────────────
router.post('/', requireDashAuth, async (req: any, res) => {
  const { name, description, category, nodes, connections, trigger_type } = req.body;
  if (!name?.trim() || !Array.isArray(nodes)) { res.status(400).json({ error: 'name and nodes required' }); return; }
  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    await db.query(`
      INSERT INTO pipelines (id, name, description, category, nodes, connections, trigger_type, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [id, name.trim(), description ?? '', category ?? 'custom', JSON.stringify(nodes), JSON.stringify(connections ?? []), trigger_type ?? 'manual', req.user.id, now, now]);
    res.status(201).json({ id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Update pipeline ───────────────────────────────────────────────────────────
router.put('/:id', requireDashAuth, async (req: any, res) => {
  const { name, description, nodes, connections, active } = req.body;
  try {
    await db.query(`
      UPDATE pipelines SET name=COALESCE($1,name), description=COALESCE($2,description),
      nodes=COALESCE($3,nodes), connections=COALESCE($4,connections), active=COALESCE($5,active), updated_at=$6
      WHERE id=$7
    `, [name ?? null, description ?? null, nodes ? JSON.stringify(nodes) : null, connections ? JSON.stringify(connections) : null, active ?? null, Date.now(), req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Delete pipeline ───────────────────────────────────────────────────────────
router.delete('/:id', requireDashAuth, async (req: any, res) => {
  try {
    await db.query(`DELETE FROM pipelines WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Run history for a pipeline ────────────────────────────────────────────────
router.get('/:id/runs', requireDashAuth, async (req, res) => {
  try {
    const runs = await db.query(`SELECT * FROM pipeline_runs WHERE pipeline_id=$1 ORDER BY started_at DESC LIMIT 20`, [req.params.id]);
    res.json({ runs: runs.map((r: any) => ({ ...r, node_results: JSON.parse(r.node_results || '{}'), artifacts: JSON.parse(r.artifacts || '[]') })) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Execute a pipeline (SSE streaming) ───────────────────────────────────────
router.post('/:id/run', requireDashAuth, async (req: any, res) => {
  try {
    const pipe = await db.queryOne(`SELECT * FROM pipelines WHERE id=$1`, [req.params.id]) as any;
    if (!pipe) { res.status(404).json({ error: 'Pipeline not found' }); return; }

    const pipeline = row2pipeline(pipe);
    const { input = '', patient_uid = '' } = req.body;

    // SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    function send(event: string, data: object) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }

    const runId = crypto.randomUUID();
    const startTs = Date.now();
    const nodeResults: Record<string, string> = {};
    const artifacts: string[] = [];

    await db.query(`
      INSERT INTO pipeline_runs (id, pipeline_id, status, inputs, started_at, triggered_by)
      VALUES ($1, $2, 'running', $3, $4, $5)
    `, [runId, pipeline.id, JSON.stringify({ input, patient_uid }), startTs, req.user.id]);

    send('start', { runId, pipeline: pipeline.name, nodeCount: pipeline.nodes.length, ts: startTs });

    let success = true;
    let finalOutput = '';

    try {
      for (let i = 0; i < pipeline.nodes.length; i++) {
        const node = pipeline.nodes[i] as PipelineNode;
        const nodeStart = Date.now();

        // Build interpolation vars
        const vars: Record<string, string> = { input, patient_uid };
        for (const [nid, out] of Object.entries(nodeResults)) vars[`${nid}.output`] = out;

        const resolvedPrompt = interpolate(node.prompt_template, vars);

        send('node_start', { nodeId: node.id, nodeIndex: i, nodeLabel: node.label, skill: node.skill, total: pipeline.nodes.length });

        // Check skill exists
        const skillPath = path.join(SKILLS_DIR, node.skill, 'SKILL.md');
        if (!fs.existsSync(skillPath)) {
          send('node_error', { nodeId: node.id, error: `Skill '${node.skill}' not found` });
          success = false;
          break;
        }

        const skillMd = fs.readFileSync(skillPath, 'utf-8');
        const fullPrompt = `You are running the ${node.skill} skill.\n\n${skillMd.slice(0, 6000)}\n\n---\n\nTask:\n${resolvedPrompt}`;

        try {
          const result = await runAgent({
            groupId: `pipeline-${runId}-${node.id}`,
            channel: 'pipeline',
            prompt: fullPrompt,
          });

          nodeResults[node.id] = result.text;
          if (result.artifacts?.length) artifacts.push(...result.artifacts);
          finalOutput = result.text;

          send('node_done', {
            nodeId: node.id,
            nodeLabel: node.label,
            skill: node.skill,
            output: result.text,
            latencyMs: Date.now() - nodeStart,
            nodeIndex: i,
          });
        } catch (err: any) {
          const msg = err?.message ?? 'Node execution failed';
          send('node_error', { nodeId: node.id, nodeLabel: node.label, error: msg });
          nodeResults[node.id] = `ERROR: ${msg}`;
          success = false;
          break;
        }
      }
    } catch (err: any) {
      success = false;
      send('error', { message: err?.message ?? 'Pipeline execution failed' });
    } finally {
      const finishTs = Date.now();

      await db.query(`
        UPDATE pipeline_runs SET status=$1, node_results=$2, final_output=$3, artifacts=$4, finished_at=$5, error=$6
        WHERE id=$7
      `, [success ? 'completed' : 'failed', JSON.stringify(nodeResults), finalOutput, JSON.stringify(artifacts), finishTs, success ? null : 'One or more nodes failed', runId]);

      await db.query(`UPDATE pipelines SET run_count=run_count+1, last_run_at=$1 WHERE id=$2`, [finishTs, pipeline.id]);

      send('done', {
        runId,
        success,
        latencyMs: finishTs - startTs,
        nodeResults,
        finalOutput,
        artifacts,
      });
      res.end();
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Run a template (no save required) ────────────────────────────────────────
router.post('/template/run', requireDashAuth, async (req: any, res) => {
  const { templateIndex, input = '' } = req.body;
  const template = TEMPLATES[Number(templateIndex)];
  if (!template) { res.status(400).json({ error: 'Invalid template index' }); return; }

  // Create a temporary pipeline record for tracking
  const tempId = crypto.randomUUID();
  const now = Date.now();
  try {
    await db.query(`
      INSERT INTO pipelines (id, name, description, category, nodes, connections, trigger_type, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [tempId, template.name + ' (template run)', template.description, template.category, JSON.stringify(template.nodes), JSON.stringify(template.connections), 'manual', req.user.id, now, now]);

    // Redirect to the run endpoint
    req.params.id = tempId;
    return (router as any).handle(Object.assign(req, { method: 'POST', url: `/${tempId}/run` }), res, () => {});
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

