/**
 * JWKS key resolution (WS-C5) — SMART on FHIR multi-tenant auth.
 *
 * Resolves a token's signing key by `kid` from either a static JWKS or a JWKS
 * endpoint (fetched + cached). Converts the JWK to a Node public KeyObject for
 * `jsonwebtoken` verification. Closes the review finding that JWKS-by-URL was
 * unimplemented (only a single static public key was supported).
 */

import * as crypto from 'crypto';
import { CdsAuthConfig, Jwk } from './types';

const JWKS_TTL_MS = 5 * 60 * 1000;

export function jwkToKeyObject(jwk: Jwk): crypto.KeyObject {
  // Node supports importing a JWK directly as a public key.
  return crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: 'jwk' });
}

export class JwksResolver {
  private cache?: { keys: Jwk[]; at: number };

  constructor(private readonly config: CdsAuthConfig) {}

  private async keys(): Promise<Jwk[]> {
    if (this.config.jwks && this.config.jwks.length) return this.config.jwks;
    if (this.config.jwksUri) {
      if (this.cache && Date.now() - this.cache.at < JWKS_TTL_MS) return this.cache.keys;
      const doFetch =
        this.config.jwksFetch ??
        ((url: string) => fetch(url) as unknown as Promise<{ json(): Promise<unknown> }>);
      const res = await doFetch(this.config.jwksUri);
      const body = (await res.json()) as { keys?: Jwk[] };
      const keys = body.keys ?? [];
      this.cache = { keys, at: Date.now() };
      return keys;
    }
    return [];
  }

  /** Resolve a verification key by `kid` (or the sole key if `kid` absent). */
  async resolve(kid: string | undefined): Promise<crypto.KeyObject | null> {
    const keys = await this.keys();
    const jwk = kid ? keys.find((k) => k.kid === kid) : keys[0];
    return jwk ? jwkToKeyObject(jwk) : null;
  }
}
