import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as crypto from 'crypto';
import * as http from 'http';
import jwt from 'jsonwebtoken';
import { verifyBearerTokenAsync, clearJwksCache, CdsAuthError } from './verify';
import { CdsAuthConfig, Jwk } from './types';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk: Jwk = { ...(publicKey.export({ format: 'jwk' }) as object), kty: 'RSA', kid: 'live-k1', alg: 'RS256', use: 'sig' };

let server: http.Server;
let port = 0;
let fetchCount = 0;

beforeAll(async () => {
  clearJwksCache();
  server = http.createServer((req, res) => {
    if (req.url === '/jwks') {
      fetchCount += 1;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ keys: [jwk] }));
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as { port: number }).port;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

const cfg = (): CdsAuthConfig => ({
  enabled: true,
  requireAsymmetric: true,
  jwksUri: `http://127.0.0.1:${port}/jwks`,
  audience: 'https://cds.example',
  trustedIssuers: ['https://ehr.example'],
  requiredScopes: ['user/Patient.read'],
  signOffScopes: [],
});
const sign = (extra: object = {}) =>
  jwt.sign({ sub: 'dr-ng', aud: 'https://cds.example', iss: 'https://ehr.example', ...extra }, privateKey, {
    algorithm: 'RS256', keyid: 'live-k1', expiresIn: '5m',
  });

describe('JWKS-by-URL live integration (ops #3)', () => {
  it('fetches the JWKS over HTTP and verifies an RS256 token', async () => {
    const claims = await verifyBearerTokenAsync(sign(), cfg());
    expect(claims.sub).toBe('dr-ng');
    expect(fetchCount).toBeGreaterThan(0);
  });

  it('caches the JWKS — a second verify does not refetch', async () => {
    const before = fetchCount;
    await verifyBearerTokenAsync(sign(), cfg());
    expect(fetchCount).toBe(before); // served from the cached resolver
  });

  it('rejects a token whose kid is not in the fetched JWKS', async () => {
    const bad = jwt.sign({ aud: 'https://cds.example', iss: 'https://ehr.example' }, privateKey, {
      algorithm: 'RS256', keyid: 'unknown', expiresIn: '5m',
    });
    await expect(verifyBearerTokenAsync(bad, cfg())).rejects.toBeInstanceOf(CdsAuthError);
  });
});
