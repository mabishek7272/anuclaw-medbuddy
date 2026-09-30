/**
 * TOTP (RFC 6238) — time-based one-time passwords for E-LAB 2FA step-up.
 *
 * Pure, dependency-free (Node crypto only): base32 (RFC 4648) + HMAC-SHA1 HOTP
 * (RFC 4226) + TOTP with a ±window for clock drift. Used to gate access to the
 * E-LAB engine console with an authenticator app (Google Authenticator, Authy,
 * 1Password, …). Verification is constant-time.
 */

import * as crypto from 'crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIOD = 30;

/** RFC 4648 base32 encode (no padding). */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** RFC 4648 base32 decode (ignores padding/whitespace/case). */
export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 4226 HOTP — HMAC-SHA1 dynamic truncation to `digits` digits. */
export function hotp(key: Buffer, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (bin % 10 ** digits).toString().padStart(digits, '0');
}

export interface TotpOptions {
  time?: number; // unix seconds
  period?: number;
  digits?: number;
}

/** Current TOTP code for a base32 secret. */
export function totp(secretB32: string, opts: TotpOptions = {}): string {
  const time = opts.time ?? Math.floor(Date.now() / 1000);
  const period = opts.period ?? PERIOD;
  return hotp(base32Decode(secretB32), Math.floor(time / period), opts.digits ?? 6);
}

/** Verify a submitted code against a base32 secret within ±window steps. */
export function verifyTotp(
  secretB32: string,
  code: string,
  opts: TotpOptions & { window?: number } = {},
): boolean {
  const c = String(code ?? '').trim();
  const digits = opts.digits ?? 6;
  if (!new RegExp(`^\\d{${digits}}$`).test(c)) return false;
  const time = opts.time ?? Math.floor(Date.now() / 1000);
  const period = opts.period ?? PERIOD;
  const window = opts.window ?? 1;
  const key = base32Decode(secretB32);
  const base = Math.floor(time / period);
  for (let w = -window; w <= window; w++) {
    const cand = hotp(key, base + w, digits);
    if (crypto.timingSafeEqual(Buffer.from(cand), Buffer.from(c))) return true;
  }
  return false;
}

/** Generate a new random base32 TOTP secret (default 160-bit). */
export function generateTotpSecret(bytes = 20): string {
  return base32Encode(crypto.randomBytes(bytes));
}

/** Build an otpauth:// URI for QR/manual enrolment in an authenticator app. */
export function otpauthUri(secretB32: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretB32,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: String(PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
