/**
 * FHIR → PatientSnapshot normaliser (plan §2.1 Patient context layer, §6.2, §6.4).
 *
 * Assembles the internal `PatientSnapshot` the pipeline operates on from a CDS
 * Hooks request: the prescribed drug comes from the order context, and the rest
 * (genotypes, active meds, allergies, conditions) from the prefetch searchsets.
 *
 * Absent-vs-confirmed-none (plan §7.4) is derived from the prefetch itself:
 *   - prefetch key missing            → 'unknown'   (the EHR was not queried)
 *   - prefetch present but empty       → 'confirmed_none' (queried, none found)
 *   - prefetch present with entries    → 'provided'
 * An explicit "no known allergies" record also yields 'confirmed_none'.
 */

import {
  AllergyRecord,
  ConditionRecord,
  GenotypeRecord,
  KnownList,
  Medication,
  PatientSnapshot,
} from '../safety/types';
import { resolveGeneId } from '../registry';
import {
  AllergyIntolerance,
  Bundle,
  CdsHookRequest,
  CodeableConcept,
  Condition,
  MedicationResource,
  Observation,
} from './types';

/** Best-effort display text for a CodeableConcept. */
function ccText(cc?: CodeableConcept): string | undefined {
  if (!cc) return undefined;
  if (cc.text?.trim()) return cc.text.trim();
  const disp = cc.coding?.find((c) => c.display?.trim())?.display;
  if (disp?.trim()) return disp.trim();
  return cc.coding?.find((c) => c.code?.trim())?.code?.trim();
}

function lower(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

/** Normalise a condition label to a snake_case code, e.g. 'active_pathological_bleeding'. */
export function normaliseConditionCode(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function entriesOf<T>(bundle: Bundle<T> | undefined): T[] {
  return (bundle?.entry ?? [])
    .map((e) => e.resource)
    .filter((r): r is T => r !== undefined && r !== null);
}

/** Build a KnownList, encoding present/confirmed-none/unknown from the prefetch. */
function knownListFrom<R, T>(
  bundle: Bundle<R> | undefined,
  mapFn: (r: R) => T | undefined,
  confirmedNoneFrom?: (rs: R[]) => boolean,
): KnownList<T> {
  if (bundle === undefined) return { status: 'unknown', items: [] };
  const resources = entriesOf(bundle);
  if (confirmedNoneFrom?.(resources)) return { status: 'confirmed_none', items: [] };
  const items = resources
    .map(mapFn)
    .filter((x): x is T => x !== undefined && x !== null);
  return { status: items.length > 0 ? 'provided' : 'confirmed_none', items };
}

// ── Resource mappers ───────────────────────────────────────────────────────────

function medicationName(m: MedicationResource): Medication | undefined {
  const name = lower(ccText(m.medicationCodeableConcept));
  return name ? { name } : undefined;
}

const NO_KNOWN_ALLERGY_CODES = new Set(['716186003', 'no known allergies', 'nka']);

function isNoKnownAllergy(a: AllergyIntolerance): boolean {
  const code = lower(a.code?.coding?.[0]?.code);
  const text = lower(ccText(a.code));
  return NO_KNOWN_ALLERGY_CODES.has(code) || NO_KNOWN_ALLERGY_CODES.has(text);
}

function allergyRecord(a: AllergyIntolerance): AllergyRecord | undefined {
  if (isNoKnownAllergy(a)) return undefined;
  const substance = lower(ccText(a.code));
  return substance ? { substance } : undefined;
}

function conditionRecord(c: Condition): ConditionRecord | undefined {
  const display = ccText(c.code);
  // Prefer an explicit code, else derive one from the display text.
  const explicit = c.code?.coding?.find((x) => x.code)?.code;
  const code = explicit
    ? normaliseConditionCode(explicit)
    : display
      ? normaliseConditionCode(display)
      : undefined;
  return code ? { code, display } : undefined;
}

// ── Genomic Observation parsing ────────────────────────────────────────────────

const GENE_TOKEN_RE = /CYP[0-9][A-Z][0-9]+/i;

function geneFromObservation(o: Observation): string | undefined {
  const candidates: string[] = [];
  if (o.code) {
    if (o.code.text) candidates.push(o.code.text);
    o.code.coding?.forEach((c) => {
      if (c.display) candidates.push(c.display);
      if (c.code) candidates.push(c.code);
    });
  }
  o.component?.forEach((comp) => {
    if (/gene/i.test(ccText(comp.code) ?? '')) {
      const v = ccText(comp.valueCodeableConcept) ?? comp.valueString;
      if (v) candidates.push(v);
    }
  });
  for (const cand of candidates) {
    const m = cand.match(GENE_TOKEN_RE);
    const symbol = (m ? m[0] : cand).trim().toUpperCase();
    if (resolveGeneId(symbol)) return symbol;
  }
  return undefined;
}

function looksLikeDiplotype(s: string | undefined): boolean {
  return !!s && (s.includes('/') || s.includes('*'));
}

function diplotypeFromObservation(o: Observation): string | undefined {
  if (looksLikeDiplotype(o.valueString)) return o.valueString!.trim();
  const v = ccText(o.valueCodeableConcept);
  if (looksLikeDiplotype(v)) return v!.trim();
  for (const comp of o.component ?? []) {
    if (/diplotype|genotype|haplotype|allele/i.test(ccText(comp.code) ?? '')) {
      const cv = comp.valueString ?? ccText(comp.valueCodeableConcept);
      if (looksLikeDiplotype(cv)) return cv!.trim();
    }
  }
  return undefined;
}

function genotypeRecords(bundle: Bundle<Observation> | undefined): GenotypeRecord[] {
  return entriesOf(bundle)
    .map((o): GenotypeRecord | undefined => {
      const gene = geneFromObservation(o);
      const diplotype = diplotypeFromObservation(o);
      return gene && diplotype ? { gene, diplotype, source: 'FHIR' } : undefined;
    })
    .filter((r): r is GenotypeRecord => r !== undefined);
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Extract the prescribed-drug MedicationRequests from the hook context. */
export function prescribedMedications(req: CdsHookRequest): Medication[] {
  const bundle = req.context.draftOrders ?? req.context.medications;
  return entriesOf(bundle)
    .map(medicationName)
    .filter((m): m is Medication => m !== undefined);
}

/**
 * Build a PatientSnapshot from a CDS Hooks request and a chosen prescribed drug.
 * `prefetch` keys: `genotypes`, `medications`, `allergies`, `conditions`.
 */
export function buildSnapshot(
  req: CdsHookRequest,
  prescribed: Medication,
): PatientSnapshot {
  const pf = req.prefetch ?? {};
  const uid = req.context.patientId ?? 'unknown-patient';

  return {
    uid,
    prescribed_drug: prescribed,
    genotypes: genotypeRecords(pf.genotypes as Bundle<Observation> | undefined),
    active_medications: knownListFrom(
      pf.medications as Bundle<MedicationResource> | undefined,
      medicationName,
    ),
    allergies: knownListFrom(
      pf.allergies as Bundle<AllergyIntolerance> | undefined,
      allergyRecord,
      (rs) => rs.length > 0 && rs.every(isNoKnownAllergy),
    ),
    conditions: knownListFrom(
      pf.conditions as Bundle<Condition> | undefined,
      conditionRecord,
    ),
  };
}
