import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { perTenantRateLimit, quotaCheck } from '../middleware/rate-limit';
import { usageMeter } from '../middleware/usage-meter';
import { runAgent } from '../../container-runner';
import * as path from 'path';
import * as fs from 'fs';

const router = Router();
const EHR_SKILL_PATH = path.resolve('./container/skills/anuclaw-ehr-patient/SKILL.md');

function ehrSkillMd(): string {
  return fs.existsSync(EHR_SKILL_PATH) ? fs.readFileSync(EHR_SKILL_PATH, 'utf8') : '';
}

function scopedGroup(tenantId: string, suffix: string): string {
  return `api-ehr-${tenantId}-${suffix}`;
}

// ── Patient registration ──────────────────────────────────────────────────────

/**
 * POST /api/v1/ehr/patients
 * Register a new patient and receive an EHR-issued UID.
 *
 * Body: { first_name, last_name, date_of_birth, gender, country_code, ...optional fields }
 */
router.post(
  '/patients',
  requireAuth, perTenantRateLimit, quotaCheck, usageMeter,
  async (req: AuthRequest, res: Response) => {
    const required = ['first_name', 'last_name', 'date_of_birth', 'gender', 'country_code'];
    const missing = required.filter(f => !req.body[f]);
    if (missing.length) {
      res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
      return;
    }

    const prompt = [
      'Task: Register a new patient using the create_patient_profile function.',
      'Return the full patient profile as JSON.',
      'Patient data:',
      JSON.stringify(req.body, null, 2),
    ].join('\n');

    try {
      const result = await runAgent({
        groupId:  scopedGroup(req.tenant!.tenant_id, 'register'),
        prompt:   `${ehrSkillMd()}\n\n---\n\n${prompt}`,
        maxTurns: 3,
      });
      res.status(201).json({ result, skill: 'anuclaw-ehr-patient' });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Patient registration failed.' });
    }
  },
);

/**
 * GET /api/v1/ehr/patients/:uid
 * Look up a patient by their UID.
 */
router.get(
  '/patients/:uid',
  requireAuth, perTenantRateLimit, quotaCheck, usageMeter,
  async (req: AuthRequest, res: Response) => {
    const { uid } = req.params;
    const prompt = `Task: Call lookup_uid("${uid}") and return the result as JSON.`;

    try {
      const result = await runAgent({
        groupId:  scopedGroup(req.tenant!.tenant_id, `lookup-${uid}`),
        prompt:   `${ehrSkillMd()}\n\n---\n\n${prompt}`,
        maxTurns: 2,
      });
      res.json({ uid, result });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Lookup failed.' });
    }
  },
);

/**
 * GET /api/v1/ehr/patients/search
 * Find all UIDs for a patient across countries.
 *
 * Query: first_name, last_name, date_of_birth, gender
 */
router.get(
  '/patients/search',
  requireAuth, perTenantRateLimit, quotaCheck, usageMeter,
  async (req: AuthRequest, res: Response) => {
    const { first_name, last_name, date_of_birth, gender } = req.query as Record<string, string>;
    if (!first_name || !last_name || !date_of_birth || !gender) {
      res.status(400).json({ error: 'first_name, last_name, date_of_birth, gender are required as query params.' });
      return;
    }

    const prompt = `Task: Call lookup_patient_by_country("${first_name}", "${last_name}", "${date_of_birth}", "${gender}") and return the list as JSON.`;

    try {
      const result = await runAgent({
        groupId:  scopedGroup(req.tenant!.tenant_id, 'search'),
        prompt:   `${ehrSkillMd()}\n\n---\n\n${prompt}`,
        maxTurns: 2,
      });
      res.json({ result });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Search failed.' });
    }
  },
);

// ── Record writes (all require valid EHR UID) ────────────────────────────────

/**
 * POST /api/v1/ehr/patients/:uid/diagnoses
 * Add a diagnosis to a registered patient.
 *
 * Body: { icd10_code?, snomed_code?, description, severity?, diagnosed_by?, status? }
 */
router.post(
  '/patients/:uid/diagnoses',
  requireAuth, perTenantRateLimit, quotaCheck, usageMeter,
  async (req: AuthRequest, res: Response) => {
    const { uid } = req.params;
    if (!req.body.description) {
      res.status(400).json({ error: 'description is required.' });
      return;
    }

    const prompt = [
      `Task: Add a diagnosis to patient UID "${uid}".`,
      'Steps:',
      '1. Call validate_uid_before_record_write(uid) first.',
      '2. If the UID is valid, call add_diagnosis(profile, diagnosis).',
      '3. Return the updated diagnosis entry as JSON.',
      'Diagnosis data:',
      JSON.stringify(req.body, null, 2),
    ].join('\n');

    try {
      const result = await runAgent({
        groupId:  scopedGroup(req.tenant!.tenant_id, `diag-${uid}`),
        prompt:   `${ehrSkillMd()}\n\n---\n\n${prompt}`,
        maxTurns: 3,
      });
      res.status(201).json({ uid, result });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to add diagnosis.' });
    }
  },
);

/**
 * POST /api/v1/ehr/patients/:uid/prescriptions
 * Add a prescription to a registered patient.
 *
 * Body: { medication_name, dosage, frequency, start_date, prescribed_by?, route?, indication? }
 */
router.post(
  '/patients/:uid/prescriptions',
  requireAuth, perTenantRateLimit, quotaCheck, usageMeter,
  async (req: AuthRequest, res: Response) => {
    const { uid } = req.params;
    const required = ['medication_name', 'dosage', 'frequency', 'start_date'];
    const missing = required.filter(f => !req.body[f]);
    if (missing.length) {
      res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
      return;
    }

    const prompt = [
      `Task: Add a prescription to patient UID "${uid}".`,
      'Steps:',
      '1. Call validate_uid_before_record_write(uid) first.',
      '2. If valid, call add_prescription(profile, rx).',
      '3. Return the prescription entry as JSON.',
      'Prescription data:',
      JSON.stringify(req.body, null, 2),
    ].join('\n');

    try {
      const result = await runAgent({
        groupId:  scopedGroup(req.tenant!.tenant_id, `rx-${uid}`),
        prompt:   `${ehrSkillMd()}\n\n---\n\n${prompt}`,
        maxTurns: 3,
      });
      res.status(201).json({ uid, result });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to add prescription.' });
    }
  },
);

/**
 * POST /api/v1/ehr/patients/:uid/lab-reports
 * Add a lab report to a registered patient.
 *
 * Body: { test_name, value, unit?, loinc_code?, reference_range?, flag?, ordered_by? }
 */
router.post(
  '/patients/:uid/lab-reports',
  requireAuth, perTenantRateLimit, quotaCheck, usageMeter,
  async (req: AuthRequest, res: Response) => {
    const { uid } = req.params;
    if (!req.body.test_name || req.body.value === undefined) {
      res.status(400).json({ error: 'test_name and value are required.' });
      return;
    }

    const prompt = [
      `Task: Add a lab report to patient UID "${uid}".`,
      '1. Call validate_uid_before_record_write(uid).',
      '2. Call add_lab_report(profile, lab).',
      '3. Return the lab entry as JSON.',
      'Lab data:',
      JSON.stringify(req.body, null, 2),
    ].join('\n');

    try {
      const result = await runAgent({
        groupId:  scopedGroup(req.tenant!.tenant_id, `lab-${uid}`),
        prompt:   `${ehrSkillMd()}\n\n---\n\n${prompt}`,
        maxTurns: 3,
      });
      res.status(201).json({ uid, result });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to add lab report.' });
    }
  },
);

/**
 * POST /api/v1/ehr/patients/:uid/hl7
 * Generate an HL7 ADT A01 admission message for a registered patient.
 *
 * Body: { ward? }
 */
router.post(
  '/patients/:uid/hl7',
  requireAuth, perTenantRateLimit, quotaCheck, usageMeter,
  async (req: AuthRequest, res: Response) => {
    const { uid } = req.params;
    const ward = req.body.ward ?? 'WARD^001^01^HOSPITAL';

    const prompt = `Task: Call generate_hl7_adt_a01("${uid}", "${ward}") and return the HL7 message string.`;

    try {
      const result = await runAgent({
        groupId:  scopedGroup(req.tenant!.tenant_id, `hl7-${uid}`),
        prompt:   `${ehrSkillMd()}\n\n---\n\n${prompt}`,
        maxTurns: 2,
      });
      res.json({ uid, hl7_message: result });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'HL7 generation failed.' });
    }
  },
);

/**
 * POST /api/v1/ehr/patients/:uid/fhir
 * Convert a patient profile to a FHIR R4 Patient resource.
 */
router.post(
  '/patients/:uid/fhir',
  requireAuth, perTenantRateLimit, quotaCheck, usageMeter,
  async (req: AuthRequest, res: Response) => {
    const { uid } = req.params;
    const prompt = `Task: Call patient_to_fhir for UID "${uid}" and return the FHIR Patient resource JSON.`;

    try {
      const result = await runAgent({
        groupId:  scopedGroup(req.tenant!.tenant_id, `fhir-${uid}`),
        prompt:   `${ehrSkillMd()}\n\n---\n\n${prompt}`,
        maxTurns: 2,
      });
      res.json({ uid, fhir_resource: result });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'FHIR conversion failed.' });
    }
  },
);

export default router;
