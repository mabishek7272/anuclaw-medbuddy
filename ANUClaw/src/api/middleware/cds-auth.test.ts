import { describe, it, expect } from 'vitest';
import type { Request, Response } from 'express';
import {
  cdsHooksAuth,
  smartScopeAuth,
  cdsAuthConfigFromEnv,
} from './cds-auth';
import { CdsAuthConfig, TokenClaims } from '../../cds';

/** Minimal fake req/res to drive middleware without an HTTP server. */
function fakeReq(authorization?: string): Request {
  return { header: (n: string) => (n.toLowerCase() === 'authorization' ? authorization : undefined) } as unknown as Request;
}
function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

function run(mw: ReturnType<typeof cdsHooksAuth>, req: Request) {
  const res = fakeRes();
  let nexted = false;
  mw(req, res, () => { nexted = true; });
  return { res, nexted };
}

const baseConfig = (over: Partial<CdsAuthConfig> = {}): CdsAuthConfig => ({
  enabled: true,
  requiredScopes: ['user/Patient.read'],
  signOffScopes: ['user/MedicationRequest.write'],
  verify: (token: string): TokenClaims => {
    if (token === 'bad') throw new Error('boom');
    return JSON.parse(token) as TokenClaims; // tests pass JSON claims as the "token"
  },
  ...over,
});

describe('cdsHooksAuth middleware', () => {
  it('passes through when auth is disabled', () => {
    const { nexted } = run(cdsHooksAuth(baseConfig({ enabled: false })), fakeReq());
    expect(nexted).toBe(true);
  });

  it('401s a missing token', () => {
    const { res, nexted } = run(cdsHooksAuth(baseConfig()), fakeReq());
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('allows a valid token', () => {
    const { res, nexted } = run(
      cdsHooksAuth(baseConfig()),
      fakeReq('Bearer ' + JSON.stringify({ sub: 'ehr', iss: 'https://ehr.example' })),
    );
    expect(nexted).toBe(true);
    expect(res.statusCode).toBe(200);
  });
});

describe('smartScopeAuth middleware', () => {
  it('403s when the required scope is missing', () => {
    const { res, nexted } = run(
      smartScopeAuth(baseConfig(), ['user/MedicationRequest.write']),
      fakeReq('Bearer ' + JSON.stringify({ scope: 'user/Patient.read' })),
    );
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('allows when the scope is granted (wildcard)', () => {
    const { res, nexted } = run(
      smartScopeAuth(baseConfig(), ['user/MedicationRequest.write']),
      fakeReq('Bearer ' + JSON.stringify({ scope: 'user/*.*' })),
    );
    expect(nexted).toBe(true);
    expect(res.statusCode).toBe(200);
  });
});

describe('cdsAuthConfigFromEnv', () => {
  it('disabled by default with no key', () => {
    expect(cdsAuthConfigFromEnv({}).enabled).toBe(false);
  });

  it('enabled once a key is configured', () => {
    const cfg = cdsAuthConfigFromEnv({ CDS_JWT_SECRET: 's' });
    expect(cfg.enabled).toBe(true);
    expect(cfg.jwtSecret).toBe('s');
  });

  it('explicit CDS_AUTH_ENABLED=false overrides a configured key', () => {
    expect(cdsAuthConfigFromEnv({ CDS_JWT_SECRET: 's', CDS_AUTH_ENABLED: 'false' }).enabled).toBe(false);
  });

  it('parses issuers, audience, and scopes', () => {
    const cfg = cdsAuthConfigFromEnv({
      CDS_JWT_PUBLIC_KEY: 'KEY',
      CDS_TRUSTED_ISSUERS: 'https://a.example, https://b.example',
      CDS_AUDIENCE: 'https://cds.example',
      CDS_REQUIRED_SCOPES: 'user/Patient.read',
    });
    expect(cfg.trustedIssuers).toEqual(['https://a.example', 'https://b.example']);
    expect(cfg.audience).toBe('https://cds.example');
    expect(cfg.requiredScopes).toEqual(['user/Patient.read']);
  });
});
