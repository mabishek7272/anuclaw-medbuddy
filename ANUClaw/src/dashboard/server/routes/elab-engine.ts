/**
 * E-LAB engine console — native dashboard endpoints (cookie-auth + TOTP 2FA).
 *
 * Surfaces the REAL E-LAB platform (oncology Drug-Combination clinical module +
 * AutoDock Vina docking) inside the dashboard, behind a TOTP step-up gate:
 *   1. /mfa/setup  — enrol an authenticator (otpauth URI + secret), once.
 *   2. /mfa/verify — submit a 6-digit code → issues a 15-min `elab_mfa` cookie.
 *   3. engine routes require BOTH dashboard auth AND a valid `elab_mfa` cookie.
 *
 * The dashboard operator runs as an internal full-grant tenant (ruo + clinical +
 * active BAA + oncology domain) — appropriate for the internal proof console.
 * Clinical content is SEED/unvalidated; internal demonstration only.
 */

import { Router, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../../../db';
import { AuthRequest, requireDashAuth } from '../auth';
import { generateTotpSecret, otpauthUri, verifyTotp } from '../totp';
import { createDefaultElabPlatform } from '../../../api/elab/platform';
import {
  ElabDeps,
  runClinicalDecision,
  ClinicalDecisionRequest,
} from '../../../api/elab/service';
import { TenantContext } from '../../../api/elab/types';
import { ClinicalDecisionModule, NeurologyAsmModule } from '../../../cds/clinical';
import { dockFromSmiles } from '../../../api/elab/dock-demo';
import { simulatePkPd, PkPdInput, computeMolecularProperties, AlphaFoldStructureEngine } from '../../../engines';
import { completeJson, safetyEnvelope, LlmUnavailableError, isBaaCovered, deidRequired, PhiHandling } from '../clinical-llm';
import { deidentify, reidentify, assessReidentificationRisk } from '../deid';

const SECRET = process.env.DASHBOARD_JWT_SECRET ?? process.env.ANUCLAW_JWT_SECRET ?? 'dashboard-secret-change-me';
const ISSUER = 'ANUClaw E-LAB';
const MFA_TTL = 15 * 60; // step-up validity (seconds)

// One platform instance for the dashboard process (in-memory audit per process).
const platform: ElabDeps = createDefaultElabPlatform();

// Clinical decision modules by domain (oncology from the platform + neurology).
const clinicalModules: Record<string, ClinicalDecisionModule<any, any>> = {
  [platform.oncology.domain]: platform.oncology,
  'neurology-combination': new NeurologyAsmModule(),
};
const CLINICAL_DOMAINS = Object.keys(clinicalModules);

/** Idempotent: add TOTP columns to dash_users (Postgres ADD COLUMN IF NOT EXISTS). */
export async function ensureMfaSchema(): Promise<void> {
  await db.query(`ALTER TABLE dash_users ADD COLUMN IF NOT EXISTS totp_secret TEXT`);
  await db.query(`ALTER TABLE dash_users ADD COLUMN IF NOT EXISTS totp_enabled INTEGER DEFAULT 0`);
}

/** The dashboard operator acts as an internal, fully-granted tenant. */
function dashTenantContext(userId: string): TenantContext {
  return {
    tenant_id: `dashboard:${userId}`,
    scopes: ['ruo', 'clinical'],
    baa_active: true,
    allowed_clinical_domains: CLINICAL_DOMAINS,
    residency: 'us',
  };
}

/** Gate: require a valid, unexpired `elab_mfa` step-up cookie for THIS user. */
function requireElabMfa(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.elab_mfa as string | undefined;
  if (!token) {
    res.status(403).json({ error: 'E-LAB locked — 2FA required', code: 'mfa_required' });
    return;
  }
  try {
    const payload = jwt.verify(token, SECRET) as { sub: string; type: string };
    if (payload.type !== 'elab_mfa' || payload.sub !== req.user!.id) throw new Error('mismatch');
    next();
  } catch {
    res.status(403).json({ error: 'E-LAB session expired — re-verify 2FA', code: 'mfa_required' });
  }
}

async function loadUserTotp(id: string): Promise<{ totp_secret: string | null; totp_enabled: number } | undefined> {
  return (await db.queryOne(
    'SELECT totp_secret, totp_enabled FROM dash_users WHERE id = $1',
    [id],
  )) as { totp_secret: string | null; totp_enabled: number } | undefined;
}

async function auditElab(userId: string, action: string, meta: object): Promise<void> {
  try {
    await db.query(
      `INSERT INTO audit_events (ts, action, actor_id, actor_type, channel, group_id, target_type, target_id, meta)
       VALUES ($1, $2, $3, 'dashboard_user', 'elab-engine', $4, 'elab', $5, $6)`,
      [Date.now(), action, userId, `dashboard:${userId}`, action, JSON.stringify(meta)],
    );
  } catch { /* audit best-effort for the dashboard mirror; engine keeps its own chained log */ }
}

const router = Router();
router.use(requireDashAuth);

// ── MFA status: is this user enrolled, and currently unlocked? ──────────────────
router.get('/mfa/status', async (req: AuthRequest, res) => {
  const row = await loadUserTotp(req.user!.id);
  let unlocked = false;
  const token = req.cookies?.elab_mfa as string | undefined;
  if (token) {
    try {
      const p = jwt.verify(token, SECRET) as { sub: string; type: string };
      unlocked = p.type === 'elab_mfa' && p.sub === req.user!.id;
    } catch { unlocked = false; }
  }
  res.json({ enrolled: !!row?.totp_enabled, unlocked });
});

// ── MFA setup: generate (or re-show pending) secret + otpauth URI ───────────────
router.post('/mfa/setup', async (req: AuthRequest, res) => {
  const row = await loadUserTotp(req.user!.id);
  if (row?.totp_enabled) {
    res.status(409).json({ error: 'Already enrolled. Use your authenticator code, or reset first.' });
    return;
  }
  // (Re)issue a pending secret until the first successful verify enables it.
  const secret = generateTotpSecret();
  await db.query('UPDATE dash_users SET totp_secret = $1, totp_enabled = 0 WHERE id = $2', [secret, req.user!.id]);
  await auditElab(req.user!.id, 'elab.mfa.setup', {});
  res.json({ secret, otpauth_uri: otpauthUri(secret, req.user!.email, ISSUER) });
});

// ── MFA verify: check code → enable (if pending) → issue step-up cookie ─────────
router.post('/mfa/verify', async (req: AuthRequest, res) => {
  const code = String((req.body?.code ?? '')).trim();
  const row = await loadUserTotp(req.user!.id);
  if (!row?.totp_secret) {
    res.status(400).json({ error: 'No 2FA enrolment in progress. Run setup first.' });
    return;
  }
  if (!verifyTotp(row.totp_secret, code)) {
    await auditElab(req.user!.id, 'elab.mfa.verify.fail', {});
    res.status(401).json({ error: 'Invalid code.' });
    return;
  }
  if (!row.totp_enabled) {
    await db.query('UPDATE dash_users SET totp_enabled = 1 WHERE id = $1', [req.user!.id]);
  }
  const token = jwt.sign({ sub: req.user!.id, type: 'elab_mfa' }, SECRET, { expiresIn: MFA_TTL });
  res.cookie('elab_mfa', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // dashboard binds 127.0.0.1 over http in dev
    maxAge: MFA_TTL * 1000,
    path: '/',
  });
  await auditElab(req.user!.id, 'elab.mfa.verify.ok', {});
  res.json({ ok: true, expires_in: MFA_TTL });
});

// ── MFA lock: clear the step-up cookie (does not un-enrol) ──────────────────────
router.post('/mfa/lock', (req: AuthRequest, res) => {
  res.clearCookie('elab_mfa', { path: '/' });
  res.json({ ok: true });
});

// ── MFA reset: drop enrolment so the user can re-enrol a new device ─────────────
router.post('/mfa/reset', async (req: AuthRequest, res) => {
  await db.query('UPDATE dash_users SET totp_secret = NULL, totp_enabled = 0 WHERE id = $1', [req.user!.id]);
  res.clearCookie('elab_mfa', { path: '/' });
  await auditElab(req.user!.id, 'elab.mfa.reset', {});
  res.json({ ok: true });
});

// ── Engine: Drug-Combination (Clinical) — deterministic verdict, multi-domain ───
router.get('/clinical/domains', (_req: AuthRequest, res) => {
  res.json({ domains: CLINICAL_DOMAINS });
});

router.post('/clinical/drug-combination', requireElabMfa, async (req: AuthRequest, res) => {
  const body = req.body as ClinicalDecisionRequest & { domain?: string };
  const domain = body?.domain ?? platform.oncology.domain;
  const module = clinicalModules[domain];
  if (!module) {
    res.status(400).json({ error: `unknown clinical domain '${domain}'`, domains: CLINICAL_DOMAINS });
    return;
  }
  if (!body?.query || !body?.context) {
    res.status(400).json({ error: 'query and context are required' });
    return;
  }
  const out = runClinicalDecision(module, dashTenantContext(req.user!.id), platform.audit, body);
  await auditElab(req.user!.id, 'elab.clinical.drug-combination', { domain, status: out.status });
  res.status(out.status).json(out.body);
});

// ── Engine: Docking (RUO) — real AutoDock Vina from SMILES (needs Docker) ───────
router.post('/dock', requireElabMfa, async (req: AuthRequest, res) => {
  const { ligand_smiles, receptor_smiles, seed } = req.body ?? {};
  const out = await dockFromSmiles({ ligand_smiles, receptor_smiles, seed });
  await auditElab(req.user!.id, 'elab.dock', { ligand_smiles, ok: out.ok });
  if (!out.ok) {
    res.status(502).json({ error: out.error, hint: 'Docking needs Docker + the anuclaw-vina image running.' });
    return;
  }
  res.json(out);
});

// ── Engine: Multi-scale Simulation (RUO) — deterministic one-compartment PK/PD ──
router.post('/simulate', requireElabMfa, async (req: AuthRequest, res) => {
  try {
    const out = simulatePkPd(req.body as PkPdInput);
    await auditElab(req.user!.id, 'elab.simulate', { route: (req.body as PkPdInput)?.route, dose_mg: (req.body as PkPdInput)?.dose_mg });
    res.json({ tier: 'ruo', regulatory: 'RUO — not for diagnostic use', engine: 'pkpd-onecompartment', result: out });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// ── Cheminformatics (RUO) — deterministic molecular properties from SMILES ──────
router.post('/properties', requireElabMfa, async (req: AuthRequest, res) => {
  try {
    const out = computeMolecularProperties(String(req.body?.smiles ?? ''));
    await auditElab(req.user!.id, 'elab.properties', { smiles: req.body?.smiles });
    res.json({ tier: 'ruo', regulatory: 'RUO — not for diagnostic use', engine: 'cheminformatics-properties', result: out });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// ── Structure lookup (RUO) — AlphaFold DB by UniProt accession (snapshot) ───────
const alphafold = new AlphaFoldStructureEngine();
router.post('/structure', requireElabMfa, async (req: AuthRequest, res) => {
  try {
    const r = await alphafold.run({ uniprot: String(req.body?.uniprot ?? '') });
    await auditElab(req.user!.id, 'elab.structure', { uniprot: req.body?.uniprot });
    res.json({ tier: 'ruo', regulatory: 'RUO — not for diagnostic use', engine: r.engine_id, reproducibility_class: r.reproducibility_class, result: r.output });
  } catch (e: any) {
    const code = e?.code === 'invalid_input' ? 400 : 502;
    res.status(code).json({ error: e?.message ?? String(e), code: e?.code });
  }
});

// ── Assistive clinician tools (Wave 2) — LLM-backed, non-diagnostic ─────────────
// All are gated by MFA, audited, and wrapped in a safety envelope. They produce
// supporting drafts only — a clinician must verify; they never decide.

async function llmRoute(
  req: AuthRequest,
  res: Response,
  action: string,
  system: string,
  user: string,
  maxTokens: number,
  auditMeta: object,
): Promise<void> {
  try {
    // BAA / egress safety: de-identify clinical free text BEFORE it leaves the
    // boundary when the provider is not BAA-covered; re-identify the model's
    // output LOCALLY afterwards (the map never egresses).
    const baa = isBaaCovered();
    let userText = user;
    let phi: PhiHandling = { deidentified: false, baa_covered: baa, redactions: 0 };
    let map: Record<string, string> = {};
    if (!baa && deidRequired()) {
      const d = deidentify(user);
      userText = d.text;
      map = d.map;
      phi = { deidentified: true, baa_covered: false, redactions: d.redactions.length, residual_risk: assessReidentificationRisk(d.redactions) };
    }

    const { data, provenance } = await completeJson(system, userText, maxTokens);
    const result = phi.deidentified && phi.redactions > 0 ? JSON.parse(reidentify(JSON.stringify(data), map)) : data;

    // Audit records de-id metadata only — never raw PHI.
    await auditElab(req.user!.id, action, { ...auditMeta, model: provenance.model, deidentified: phi.deidentified, redactions: phi.redactions, baa_covered: baa });
    res.json({ ...safetyEnvelope(provenance, phi), result });
  } catch (e) {
    if (e instanceof LlmUnavailableError) {
      res.status(503).json({ error: e.message, code: 'llm_unavailable' });
      return;
    }
    res.status(502).json({ error: 'Assistive tool failed', detail: e instanceof Error ? e.message : String(e) });
  }
}

// Med NLP — grounded clinical-text extraction (every item carries a verbatim quote).
router.post('/nlp/extract', requireElabMfa, async (req: AuthRequest, res) => {
  const text = String(req.body?.text ?? '').trim();
  if (!text) { res.status(400).json({ error: 'text is required' }); return; }
  const system = [
    'Extract structured clinical entities from the clinical text below.',
    'Return JSON with this exact shape:',
    '{"problems":[{"text":"","evidence_quote":""}],"medications":[{"name":"","dose":"","route":"","frequency":"","evidence_quote":""}],',
    '"allergies":[{"substance":"","reaction":"","evidence_quote":""}],"vitals":[{"name":"","value":"","unit":"","evidence_quote":""}],',
    '"labs":[{"name":"","value":"","unit":"","flag":"","evidence_quote":""}],"red_flags":[{"description":"","urgency":"","evidence_quote":""}],',
    '"notes":""}',
    'Every extracted item MUST include evidence_quote copied VERBATIM from the input. If a category has no evidence, return an empty array. Do not infer values that are not written.',
  ].join('\n');
  await llmRoute(req, res, 'elab.nlp.extract', system, `CLINICAL TEXT:\n"""\n${text}\n"""`, 2000, { chars: text.length });
});

// Medical reporting — READ: structured summary of an existing report.
router.post('/report/read', requireElabMfa, async (req: AuthRequest, res) => {
  const text = String(req.body?.text ?? '').trim();
  if (!text) { res.status(400).json({ error: 'text is required' }); return; }
  const system = [
    'Summarize the existing clinical report below for a clinician. Do NOT diagnose; report only what the document states.',
    'Return JSON: {"document_type":"","sections":[{"heading":"","summary":""}],"key_findings":[{"finding":"","evidence_quote":""}],"follow_up_items":[""],"missing_or_ambiguous":[""]}',
    'Quote verbatim for key_findings. Flag anything unclear in missing_or_ambiguous rather than guessing.',
  ].join('\n');
  await llmRoute(req, res, 'elab.report.read', system, `REPORT:\n"""\n${text}\n"""`, 2000, { chars: text.length });
});

// Medical reporting — WRITE: draft a clinical document from structured inputs.
router.post('/report/draft', requireElabMfa, async (req: AuthRequest, res) => {
  const report_type = String(req.body?.report_type ?? 'clinical note').trim();
  const inputs = req.body?.inputs;
  if (!inputs || (typeof inputs === 'string' && !inputs.trim())) { res.status(400).json({ error: 'inputs is required' }); return; }
  const system = [
    `Draft a "${report_type}" from the structured inputs below.`,
    'Return JSON: {"title":"","watermark":"DRAFT — clinician must verify","sections":[{"heading":"","content":""}]}',
    'Use ONLY the provided inputs. Where required information is missing, write "[NOT PROVIDED]" — never invent clinical facts, values, or diagnoses.',
    'Document the provided information; do not assert diagnoses or plans as established fact.',
  ].join('\n');
  await llmRoute(req, res, 'elab.report.draft', system, `REPORT TYPE: ${report_type}\nINPUTS:\n${typeof inputs === 'string' ? inputs : JSON.stringify(inputs, null, 2)}`, 2200, { report_type });
});

// Second opinion — advisory; cannot override the deterministic engine verdict.
router.post('/second-opinion', requireElabMfa, async (req: AuthRequest, res) => {
  const case_summary = String(req.body?.case_summary ?? '').trim();
  const proposed_plan = String(req.body?.proposed_plan ?? '').trim();
  const engine_verdict = req.body?.engine_verdict ?? null;
  if (!case_summary) { res.status(400).json({ error: 'case_summary is required' }); return; }
  const system = [
    'Provide an independent, ADVISORY second opinion on the proposed plan for the treating clinician.',
    'You are advisory ONLY and CANNOT override the deterministic engine verdict (if provided).',
    'Return JSON: {"concordance_with_engine":"agree|partial|differ|no_engine_input","summary":"","considerations":[""],"questions_to_resolve":[""],"cautions":[""],"defers_to_block":false}',
    'If engine_verdict.decision is "block", then defers_to_block MUST be true and you MUST NOT recommend proceeding against that block.',
    'Frame everything as considerations for the treating clinician — never as directives, diagnoses, or prescriptions.',
  ].join('\n');
  const user = [
    `CASE SUMMARY:\n${case_summary}`,
    proposed_plan ? `\nPROPOSED PLAN:\n${proposed_plan}` : '',
    engine_verdict ? `\nDETERMINISTIC ENGINE VERDICT (authoritative, cannot be overridden):\n${JSON.stringify(engine_verdict, null, 2)}` : '\n(No engine verdict supplied.)',
  ].join('\n');
  await llmRoute(req, res, 'elab.second-opinion', system, user, 1600, { has_engine_verdict: !!engine_verdict });
});

export default router;
