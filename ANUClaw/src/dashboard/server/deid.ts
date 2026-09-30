/**
 * PHI de-identification for E-LAB assistive tools (BAA / egress-safety path).
 *
 * When the configured LLM provider is NOT covered by a BAA, free-text clinical
 * input must be de-identified BEFORE it leaves the trust boundary. This module
 * deterministically redacts the pattern-detectable HIPAA Safe Harbor identifiers
 * (contact info, IDs, dates, URLs/IPs, labelled names) and returns a reversible
 * map so the LLM's output can be re-identified locally (the map never egresses).
 *
 * HONEST LIMITS: regex de-identification reduces — does not eliminate — risk.
 * Free-text *names without markers* and rare identifiers can be missed; this is
 * risk-reduction, not certified Safe Harbor. For production clinical use either
 * route to a BAA-covered / on-prem model, or add a validated clinical-NER
 * de-identifier. See `assessReidentificationRisk`.
 */

export type PhiType = 'EMAIL' | 'PHONE' | 'SSN' | 'MRN' | 'DATE' | 'URL' | 'IP' | 'NAME' | 'ZIP' | 'ID';

export interface Redaction {
  type: PhiType;
  placeholder: string;
  original: string;
}

export interface DeidResult {
  text: string;
  redactions: Redaction[];
  /** placeholder → original (local only; never sent to the provider). */
  map: Record<string, string>;
}

interface Rule { type: PhiType; re: RegExp; group?: number }

// Order matters: more specific patterns first so generic ones don't shadow them.
const RULES: Rule[] = [
  { type: 'URL',   re: /\bhttps?:\/\/[^\s)]+/gi },
  { type: 'EMAIL', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { type: 'IP',    re: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g },
  { type: 'SSN',   re: /\b\d{3}-\d{2}-\d{4}\b/g },
  // Labelled medical record / patient identifiers (capture the id).
  { type: 'MRN',   re: /\b(?:MRN|medical record(?:\s*(?:number|no\.?|#))?|record\s*(?:number|no\.?|#)|patient\s*id|chart\s*(?:number|no\.?|#)?|nhs(?:\s*(?:number|no\.?|#))?)\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9-]{3,})/gi, group: 1 },
  // Phone numbers (US/intl-ish).
  { type: 'PHONE', re: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g },
  // Dates: ISO, slashed/dashed numeric, and textual month-day-year.
  { type: 'DATE',  re: /\b\d{4}-\d{2}-\d{2}\b/g },
  { type: 'DATE',  re: /\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/g },
  { type: 'DATE',  re: /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b/gi },
  // Labelled or honorific names (best-effort).
  { type: 'NAME',  re: /\b(?:name|patient|pt\.? name)\s*[:#]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z'’-]+)+)/gi, group: 1 },
  { type: 'NAME',  re: /\b(?:Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z'’-]+)*)/g, group: 1 },
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function deidentify(input: string): DeidResult {
  let text = input ?? '';
  const redactions: Redaction[] = [];
  const map: Record<string, string> = {};
  const counters: Partial<Record<PhiType, number>> = {};
  const assigned = new Map<string, string>(); // original → placeholder (stable reuse)

  for (const rule of RULES) {
    text = text.replace(rule.re, (match, ...args) => {
      const original = rule.group ? args[rule.group - 1] : match;
      if (!original) return match;
      // Don't double-redact something already inside a placeholder.
      if (/^\[[A-Z]+_\d+\]$/.test(String(original))) return match;
      let placeholder = assigned.get(original);
      if (!placeholder) {
        const n = (counters[rule.type] = (counters[rule.type] ?? 0) + 1);
        placeholder = `[${rule.type}_${n}]`;
        assigned.set(original, placeholder);
        map[placeholder] = original;
        redactions.push({ type: rule.type, placeholder, original });
      }
      // Preserve any label prefix captured outside the group.
      return rule.group ? match.replace(original, placeholder) : placeholder;
    });
  }
  return { text, redactions, map };
}

/** Restore originals into LLM output, locally (placeholders the model echoed back). */
export function reidentify(text: string, map: Record<string, string>): string {
  let out = text ?? '';
  for (const [placeholder, original] of Object.entries(map)) {
    out = out.replace(new RegExp(escapeRe(placeholder), 'g'), original);
  }
  return out;
}

/** Coarse residual-risk signal for the audit/envelope (never includes raw PHI). */
export function assessReidentificationRisk(redactions: Redaction[]): 'low' | 'residual' {
  // Names are the weakest category for regex de-id → flag residual risk if any
  // free text remained that we could not structurally verify.
  return redactions.some((r) => r.type === 'NAME') ? 'residual' : 'low';
}
