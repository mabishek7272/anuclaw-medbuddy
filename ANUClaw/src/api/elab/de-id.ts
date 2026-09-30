/**
 * RUO de-identification input gate (Phase 0, gate Spec 5 / item #6).
 *
 * Makes "de-identified" an ENFORCED gate, not a label. Rejects inputs carrying
 * direct identifiers or high-re-identification-risk genomic payloads; such data
 * must go through the Clinical tier under a BAA, never RUO.
 */

export interface DeIdResult {
  ok: boolean;
  reason?: string;
}

const IDENTIFIER_KEYS = new Set([
  'name', 'first_name', 'last_name', 'fullname', 'patient_name',
  'mrn', 'medical_record_number', 'patient_id', 'nhs_number', 'ssn',
  'dob', 'date_of_birth', 'birthdate', 'email', 'phone', 'address', 'postcode', 'zip',
]);

/** Variant sets larger than this are treated as re-identifying (personal data). */
const MAX_RUO_VARIANTS = 5;

function scan(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const v of value) {
      const r = scan(v);
      if (r) return r;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const kl = k.toLowerCase();
      if (IDENTIFIER_KEYS.has(kl)) return `direct identifier field '${k}'`;
      if (/genome|vcf|fastq|\bgermline\b/.test(kl)) return `genomic payload field '${k}'`;
      if (kl === 'variants' && Array.isArray(v) && v.length > MAX_RUO_VARIANTS) {
        return `large variant set (${v.length}) — treated as personal data`;
      }
      const r = scan(v);
      if (r) return r;
    }
  }
  return null;
}

export function checkRuoInput(input: unknown): DeIdResult {
  const hit = scan(input);
  return hit ? { ok: false, reason: hit } : { ok: true };
}
