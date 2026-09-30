import { describe, it, expect } from 'vitest';
import { deidentify, reidentify } from './deid';

describe('PHI de-identification', () => {
  it('redacts contact identifiers and is reversible', () => {
    const src = 'Contact jane.doe@hospital.org or 555-123-4567. SSN 123-45-6789.';
    const d = deidentify(src);
    expect(d.text).not.toContain('jane.doe@hospital.org');
    expect(d.text).not.toContain('555-123-4567');
    expect(d.text).not.toContain('123-45-6789');
    expect(d.text).toMatch(/\[EMAIL_1\]/);
    expect(d.text).toMatch(/\[PHONE_1\]/);
    expect(d.text).toMatch(/\[SSN_1\]/);
    // Round-trips exactly.
    expect(reidentify(d.text, d.map)).toBe(src);
  });

  it('redacts labelled MRN and patient name, keeping the label', () => {
    const d = deidentify('Patient: John Smith. MRN: A1234567. Seen today.');
    expect(d.text).not.toContain('John Smith');
    expect(d.text).not.toContain('A1234567');
    expect(d.text).toContain('Patient:'); // label preserved
    expect(d.text).toContain('MRN:');
    expect(reidentify(d.text, d.map)).toContain('John Smith');
    expect(reidentify(d.text, d.map)).toContain('A1234567');
  });

  it('redacts dates in several formats', () => {
    const d = deidentify('DOB 1978-04-12, visit 04/12/2024, follow-up Jan 5, 2025.');
    expect(d.text).not.toMatch(/1978-04-12|04\/12\/2024|Jan 5, 2025/);
    expect(d.redactions.filter((r) => r.type === 'DATE').length).toBe(3);
  });

  it('does NOT redact ordinary clinical wording or lab values', () => {
    const src = 'Troponin 0.9 ng/mL elevated; BP 168/98; chest pain x2h.';
    const d = deidentify(src);
    // Lab/vital numbers must survive (no date/phone false-positives here).
    expect(d.text).toContain('Troponin 0.9 ng/mL');
    expect(d.text).toContain('chest pain');
  });

  it('reuses one placeholder for a repeated identifier', () => {
    const d = deidentify('Email a@b.com; reply to a@b.com again.');
    expect(d.redactions.filter((r) => r.type === 'EMAIL').length).toBe(1);
    expect((d.text.match(/\[EMAIL_1\]/g) ?? []).length).toBe(2);
  });
});
