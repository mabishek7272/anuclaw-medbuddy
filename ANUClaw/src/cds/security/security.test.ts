import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { scopeSatisfies, hasRequiredScopes, grantedScopes } from './scopes';
import { extractBearer, verifyBearerToken, CdsAuthError } from './verify';
import { CdsAuthConfig } from './types';

describe('SMART scope matching (plan §6.5)', () => {
  it('matches exact and wildcard scopes', () => {
    expect(scopeSatisfies('user/MedicationRequest.write', 'user/MedicationRequest.write')).toBe(true);
    expect(scopeSatisfies('user/*.*', 'user/Patient.read')).toBe(true);
    expect(scopeSatisfies('user/MedicationRequest.*', 'user/MedicationRequest.write')).toBe(true);
    expect(scopeSatisfies('user/*.write', 'user/MedicationRequest.write')).toBe(true);
  });

  it('respects context and resource boundaries', () => {
    expect(scopeSatisfies('patient/*.*', 'user/Patient.read')).toBe(false); // context differs
    expect(scopeSatisfies('user/Observation.read', 'user/Patient.read')).toBe(false);
    expect(scopeSatisfies('user/Patient.read', 'user/Patient.write')).toBe(false); // read ≠ write
  });

  it('handles SMART v2 cruds actions', () => {
    expect(scopeSatisfies('user/Patient.rs', 'user/Patient.read')).toBe(true); // r+s covers read
    expect(scopeSatisfies('user/Patient.cruds', 'user/Patient.write')).toBe(true);
  });

  it('reads scopes from `scope` (string) or `scp` (array)', () => {
    expect(grantedScopes({ scope: 'a b c' })).toEqual(['a', 'b', 'c']);
    expect(grantedScopes({ scp: ['x', 'y'] })).toEqual(['x', 'y']);
    expect(hasRequiredScopes({ scope: 'user/*.*' }, ['user/Patient.read'])).toBe(true);
    expect(hasRequiredScopes({ scope: 'user/Patient.read' }, ['user/MedicationRequest.write'])).toBe(false);
  });
});

describe('Bearer extraction', () => {
  it('extracts a token and rejects malformed headers', () => {
    expect(extractBearer('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(() => extractBearer(undefined)).toThrow(CdsAuthError);
    expect(() => extractBearer('Basic xyz')).toThrow(/Bearer/);
  });
});

describe('JWT verification (HS256)', () => {
  const secret = 'test-secret';
  const config: CdsAuthConfig = {
    enabled: true,
    jwtSecret: secret,
    audience: 'https://cds.anuclaw.example',
    trustedIssuers: ['https://ehr.example'],
    requiredScopes: ['user/Patient.read'],
    signOffScopes: ['user/MedicationRequest.write'],
  };

  const sign = (payload: object, opts: jwt.SignOptions = {}) =>
    jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: '5m', ...opts });

  it('verifies a valid token with matching aud + iss', () => {
    const token = sign({ scope: 'user/Patient.read', aud: config.audience, iss: 'https://ehr.example', sub: 'dr-ng' });
    const claims = verifyBearerToken(token, config);
    expect(claims.sub).toBe('dr-ng');
  });

  it('rejects an expired token', () => {
    const token = sign({ aud: config.audience, iss: 'https://ehr.example' }, { expiresIn: '-1s' });
    expect(() => verifyBearerToken(token, config)).toThrow(CdsAuthError);
  });

  it('rejects a wrong audience', () => {
    const token = sign({ aud: 'https://other.example', iss: 'https://ehr.example' });
    expect(() => verifyBearerToken(token, config)).toThrow(/Invalid token/);
  });

  it('rejects an untrusted issuer', () => {
    const token = sign({ aud: config.audience, iss: 'https://evil.example' });
    expect(() => verifyBearerToken(token, config)).toThrow(CdsAuthError);
  });

  it('rejects a token signed with the wrong key', () => {
    const token = jwt.sign({ aud: config.audience, iss: 'https://ehr.example' }, 'wrong-secret', { algorithm: 'HS256' });
    expect(() => verifyBearerToken(token, config)).toThrow(CdsAuthError);
  });
});
