import { describe, it, expect } from 'vitest';
import {
  base32Encode,
  base32Decode,
  hotp,
  totp,
  verifyTotp,
  generateTotpSecret,
  otpauthUri,
} from './totp';

// RFC 4226 Appendix D test key: ASCII "12345678901234567890".
const RFC_KEY = Buffer.from('12345678901234567890', 'ascii');
const RFC_HOTP = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    for (const sample of ['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar', 'hello world']) {
      const buf = Buffer.from(sample, 'utf8');
      expect(base32Decode(base32Encode(buf)).toString('utf8')).toBe(sample);
    }
  });
  it('decodes case-insensitively and ignores whitespace', () => {
    const enc = base32Encode(Buffer.from('test'));
    expect(base32Decode(enc.toLowerCase()).toString()).toBe('test');
    expect(base32Decode(enc.split('').join(' ')).toString()).toBe('test');
  });
});

describe('hotp (RFC 4226 vectors)', () => {
  it('matches the canonical 6-digit sequence', () => {
    RFC_HOTP.forEach((expected, counter) => {
      expect(hotp(RFC_KEY, counter)).toBe(expected);
    });
  });
});

describe('totp', () => {
  it('uses floor(time/period) as the HOTP counter', () => {
    // base32 of the RFC key
    const secret = base32Encode(RFC_KEY);
    expect(totp(secret, { time: 59 })).toBe(hotp(RFC_KEY, 1)); // counter 1
    expect(totp(secret, { time: 0 })).toBe(hotp(RFC_KEY, 0)); // counter 0
  });
});

describe('verifyTotp', () => {
  const secret = generateTotpSecret();
  it('accepts the current code', () => {
    const t = 1_700_000_000;
    expect(verifyTotp(secret, totp(secret, { time: t }), { time: t })).toBe(true);
  });
  it('accepts a code from the adjacent window (clock drift)', () => {
    const t = 1_700_000_000;
    const prev = totp(secret, { time: t - 30 });
    expect(verifyTotp(secret, prev, { time: t, window: 1 })).toBe(true);
  });
  it('rejects a code outside the window', () => {
    const t = 1_700_000_000;
    const old = totp(secret, { time: t - 120 });
    expect(verifyTotp(secret, old, { time: t, window: 1 })).toBe(false);
  });
  it('rejects garbage / wrong-length input', () => {
    const t = 1_700_000_000;
    expect(verifyTotp(secret, '000', { time: t })).toBe(false);
    expect(verifyTotp(secret, 'abcdef', { time: t })).toBe(false);
    expect(verifyTotp(secret, '', { time: t })).toBe(false);
  });
});

describe('otpauthUri', () => {
  it('builds a scannable otpauth URI', () => {
    const uri = otpauthUri('JBSWY3DPEHPK3PXP', 'ak@irairf.com', 'ANUClaw E-LAB');
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=ANUClaw');
  });
});
