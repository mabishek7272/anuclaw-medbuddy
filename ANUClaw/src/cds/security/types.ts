/**
 * CDS security types — SMART on FHIR / CDS Hooks auth (plan §6.5).
 *
 * The decision core stays untouched; this is an edge concern. Verification is
 * kept pure (no Express) so it is unit-testable; the Express middleware lives in
 * the app layer (`src/api/middleware/cds-auth.ts`).
 */

import type { Algorithm } from 'jsonwebtoken';

/** Claims we read from a verified SMART access token or CDS Hooks JWT. */
export interface TokenClaims {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  exp?: number;
  iat?: number;
  jti?: string;
  /** SMART scopes (space-delimited) — or `scp` as an array on some IdPs. */
  scope?: string;
  scp?: string | string[];
  [key: string]: unknown;
}

/** A JSON Web Key (subset) used for JWKS verification (WS-C5). */
export interface Jwk {
  kty: string;
  kid?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
  crv?: string;
  x?: string;
  y?: string;
  [key: string]: unknown;
}

/** Minimal fetch shape so JWKS-by-URL is testable without the global. */
export type JwksFetch = (url: string) => Promise<{ json(): Promise<unknown> }>;

export interface CdsAuthConfig {
  /** Master switch. When false the guards pass through (dev only). */
  enabled: boolean;
  /** HS256 shared secret (dev) — used if no public key is set. */
  jwtSecret?: string;
  /** RS256 public key (PEM) of the trusted issuer (EHR / SMART auth server). */
  jwtPublicKey?: string;
  /** Allowed signing algorithms (defaults by which key is present). */
  algorithms?: Algorithm[];
  /** Allowlisted token issuers (`iss`); empty ⇒ issuer not checked. */
  trustedIssuers?: string[];
  /** Expected audience (`aud`) — this CDS service's URL. */
  audience?: string;
  /** Scopes required for the review/read endpoints. */
  requiredScopes: string[];
  /** Additional scopes required to record a clinician sign-off (write). */
  signOffScopes: string[];
  /** Test/override hook: bypass jsonwebtoken and return claims directly. */
  verify?: (token: string) => TokenClaims;
  // ── WS-C5 hardening ──────────────────────────────────────────────────────
  /** Static JWKS (array of JWK) — verification key resolved by `kid`. */
  jwks?: Jwk[];
  /** JWKS endpoint URL — fetched + cached, key resolved by `kid`. */
  jwksUri?: string;
  /** Injectable fetch for JWKS (defaults to global fetch). */
  jwksFetch?: JwksFetch;
  /** When true, only asymmetric algorithms (RS/ES) are accepted (HS256 rejected). */
  requireAsymmetric?: boolean;
}
