import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { verifyBearerTokenAsync, CdsAuthError } from './verify';
import { CdsAuthConfig, Jwk } from './types';
import {
  assertClinicalAuthHardened,
  cdsHooksAuthHardened,
  smartScopeAuthHardened,
} from '../../api/middleware/cds-auth';
import type { Request, Response } from 'express';

// Real RSA keypair + its public JWK (kid = k1).
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk: Jwk = { ...(publicKey.export({ format: 'jwk' }) as object), kty: 'RSA', kid: 'k1', alg: 'RS256', use: 'sig' };

const cfg = (over: Partial<CdsAuthConfig> = {}): CdsAuthConfig => ({
  enabled: true,
  requireAsymmetric: true,
  jwks: [jwk],
  audience: 'https://cds.example',
  trustedIssuers: ['https://ehr.example'],
  requiredScopes: ['user/Patient.read'],
  signOffScopes: ['user/MedicationRequest.write'],
  ...over,
});

const signRs = (payload: object, kid = 'k1') =>
  jwt.sign(payload, privateKey, { algorithm: 'RS256', keyid: kid, expiresIn: '5m' });
const claims = (extra: object = {}) => ({ sub: 'dr-ng', aud: 'https://cds.example', iss: 'https://ehr.example', ...extra });

describe('verifyBearerTokenAsync — JWKS by kid (WS-C5)', () => {
  it('verifies an RS256 token against the JWKS', async () => {
    const c = await verifyBearerTokenAsync(signRs(claims({ scope: 'user/Patient.read' })), cfg());
    expect(c.sub).toBe('dr-ng');
  });
  it('rejects an unknown kid', async () => {
    await expect(verifyBearerTokenAsync(signRs(claims(), 'nope'), cfg())).rejects.toBeInstanceOf(CdsAuthError);
  });
  it('rejects HS256 when asymmetric is required', async () => {
    const hs = jwt.sign(claims(), 'shared-secret', { algorithm: 'HS256' });
    await expect(verifyBearerTokenAsync(hs, cfg())).rejects.toThrow(/asymmetric/i);
  });
  it('rejects a wrong audience', async () => {
    await expect(verifyBearerTokenAsync(signRs(claims({ aud: 'https://evil.example' })), cfg())).rejects.toBeInstanceOf(CdsAuthError);
  });
});

describe('assertClinicalAuthHardened (WS-C5, fail-closed config)', () => {
  it('passes a properly hardened config', () => {
    expect(() => assertClinicalAuthHardened(cfg())).not.toThrow();
  });
  it('throws on disabled / symmetric / HS256-secret / no-key', () => {
    expect(() => assertClinicalAuthHardened(cfg({ enabled: false }))).toThrow(/enabled/i);
    expect(() => assertClinicalAuthHardened(cfg({ requireAsymmetric: false }))).toThrow(/asymmetric/i);
    expect(() => assertClinicalAuthHardened(cfg({ jwtSecret: 's' }))).toThrow(/HS256/);
    expect(() => assertClinicalAuthHardened(cfg({ jwks: undefined }))).toThrow(/JWKS|public key/i);
  });
});

describe('hardened middleware (WS-C5, async)', () => {
  const fakeReq = (auth?: string) =>
    ({ header: (n: string) => (n.toLowerCase() === 'authorization' ? auth : undefined) }) as unknown as Request;
  const fakeRes = () =>
    ({ statusCode: 200, body: undefined as unknown,
       status(c: number) { this.statusCode = c; return this; },
       json(b: unknown) { this.body = b; return this; } }) as unknown as Response & { statusCode: number };

  it('cdsHooksAuthHardened allows a valid RS256 token and 401s a missing one', async () => {
    const mw = cdsHooksAuthHardened(cfg());
    const ok = fakeRes(); let nexted = false;
    await mw(fakeReq('Bearer ' + signRs(claims())), ok, () => { nexted = true; });
    expect(nexted).toBe(true);
    const bad = fakeRes(); let n2 = false;
    await mw(fakeReq(undefined), bad, () => { n2 = true; });
    expect(n2).toBe(false);
    expect(bad.statusCode).toBe(401);
  });

  it('smartScopeAuthHardened 403s an insufficient scope', async () => {
    const mw = smartScopeAuthHardened(cfg(), ['user/MedicationRequest.write']);
    const res = fakeRes(); let nexted = false;
    await mw(fakeReq('Bearer ' + signRs(claims({ scope: 'user/Patient.read' }))), res, () => { nexted = true; });
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(403);
  });
});
