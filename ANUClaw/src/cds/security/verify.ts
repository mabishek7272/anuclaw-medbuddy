/**
 * Bearer-token verification for the CDS endpoints (plan §6.5).
 *
 * Validates a SMART access token / CDS Hooks JWT: signature (RS256 public key or
 * HS256 secret), expiry, and — when configured — audience and issuer allowlist.
 * Pure (no Express). JWKS-by-URL resolution is out of scope here; configure the
 * issuer's public key (or inject `verify` for tests).
 */

import jwt, { Algorithm } from 'jsonwebtoken';
import { CdsAuthConfig, TokenClaims } from './types';
import { JwksResolver } from './jwks';

/** Asymmetric algorithms permitted when `requireAsymmetric` is set. */
export const ASYMMETRIC_ALGS: Algorithm[] = [
  'RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512',
];

/** 401 = unauthenticated (bad/missing token); 403 = insufficient scope. */
export class CdsAuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = 'CdsAuthError';
  }
}

/** Pull the token out of an `Authorization: Bearer <jwt>` header. */
export function extractBearer(authorization: string | undefined): string {
  if (!authorization) throw new CdsAuthError(401, 'Missing Authorization header');
  const m = authorization.match(/^Bearer\s+(.+)$/i);
  if (!m) throw new CdsAuthError(401, 'Authorization header must be a Bearer token');
  return m[1].trim();
}

export function verifyBearerToken(token: string, config: CdsAuthConfig): TokenClaims {
  if (config.verify) return config.verify(token); // test/override hook

  const key = config.jwtPublicKey ?? config.jwtSecret;
  if (!key) {
    throw new CdsAuthError(401, 'CDS auth misconfigured: no verification key');
  }
  const algorithms = config.algorithms ?? (config.jwtPublicKey ? ['RS256'] : ['HS256']);

  try {
    return jwt.verify(token, key, {
      algorithms,
      audience: config.audience,
      issuer:
        config.trustedIssuers && config.trustedIssuers.length
          ? (config.trustedIssuers as [string, ...string[]])
          : undefined,
    }) as TokenClaims;
  } catch (err) {
    throw new CdsAuthError(
      401,
      `Invalid token: ${err instanceof Error ? err.message : 'verification failed'}`,
    );
  }
}

// Cache JWKS resolvers by endpoint so we don't refetch the JWKS per token
// (the resolver itself TTL-caches the keys). Static-JWKS configs aren't cached.
const resolverCache = new Map<string, JwksResolver>();

function resolverFor(config: CdsAuthConfig): JwksResolver {
  if (config.jwksUri) {
    let r = resolverCache.get(config.jwksUri);
    if (!r) {
      r = new JwksResolver(config);
      resolverCache.set(config.jwksUri, r);
    }
    return r;
  }
  return new JwksResolver(config);
}

/** Test helper: clear the JWKS resolver cache. */
export function clearJwksCache(): void {
  resolverCache.clear();
}

function issuerOption(config: CdsAuthConfig): string | [string, ...string[]] | undefined {
  return config.trustedIssuers && config.trustedIssuers.length
    ? (config.trustedIssuers as [string, ...string[]])
    : undefined;
}

/**
 * Hardened verification (WS-C5): supports JWKS-by-`kid`, and — when
 * `requireAsymmetric` is set — rejects HS256/none. Falls back to the static-key
 * path when no JWKS is configured. Async because JWKS resolution may fetch.
 */
export async function verifyBearerTokenAsync(
  token: string,
  config: CdsAuthConfig,
): Promise<TokenClaims> {
  if (config.verify) return config.verify(token); // test/override hook

  if (config.jwks?.length || config.jwksUri) {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string') {
      throw new CdsAuthError(401, 'Malformed token');
    }
    const alg = decoded.header.alg;
    if (config.requireAsymmetric && !ASYMMETRIC_ALGS.includes(alg as Algorithm)) {
      throw new CdsAuthError(401, `Algorithm '${alg}' is not permitted (asymmetric required)`);
    }
    const key = await resolverFor(config).resolve(decoded.header.kid);
    if (!key) {
      throw new CdsAuthError(401, `No JWKS key for kid '${decoded.header.kid ?? '(none)'}'`);
    }
    try {
      return jwt.verify(token, key, {
        algorithms: config.algorithms ?? ASYMMETRIC_ALGS,
        audience: config.audience,
        issuer: issuerOption(config),
      }) as TokenClaims;
    } catch (err) {
      throw new CdsAuthError(401, `Invalid token: ${err instanceof Error ? err.message : 'verification failed'}`);
    }
  }

  // Static-key path. Enforce asymmetric-only when required.
  if (config.requireAsymmetric && !config.jwtPublicKey) {
    throw new CdsAuthError(401, 'Asymmetric verification key required (no public key configured)');
  }
  return verifyBearerToken(token, config);
}
