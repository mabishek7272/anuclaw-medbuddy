/**
 * Express auth middleware for the CDS endpoints — SMART on FHIR / CDS Hooks
 * (plan §6.5).
 *
 *   cdsHooksAuth   — validates the CDS Hooks JWT on the invocation endpoint
 *                    (signature + exp + issuer allowlist + audience).
 *   smartScopeAuth — validates a SMART access token AND requires scopes for the
 *                    clinician review / sign-off endpoints.
 *
 * When auth is disabled (dev, no key configured) the guards pass through; the
 * router logs a prominent warning at construction time. Failures are fail-closed:
 * 401 for a bad/missing token, 403 for insufficient scope.
 */

import { Request, Response, NextFunction } from 'express';
import {
  CdsAuthConfig,
  CdsAuthError,
  TokenClaims,
  extractBearer,
  hasRequiredScopes,
  verifyBearerToken,
  verifyBearerTokenAsync,
} from '../../cds';

export interface CdsAuthedRequest extends Request {
  cdsAuth?: TokenClaims;
}

function deny(res: Response, err: unknown): void {
  const status = err instanceof CdsAuthError ? err.status : 401;
  res.status(status).json({ error: err instanceof Error ? err.message : 'unauthorized' });
}

/** Guard the CDS Hooks invocation endpoint with the EHR-issued JWT. */
export function cdsHooksAuth(config: CdsAuthConfig) {
  return (req: CdsAuthedRequest, res: Response, next: NextFunction): void => {
    if (!config.enabled) return next();
    try {
      req.cdsAuth = verifyBearerToken(extractBearer(req.header('authorization')), config);
      next();
    } catch (err) {
      deny(res, err);
    }
  };
}

/** Guard a clinician endpoint with a SMART access token AND required scopes. */
export function smartScopeAuth(config: CdsAuthConfig, requiredScopes: string[]) {
  return (req: CdsAuthedRequest, res: Response, next: NextFunction): void => {
    if (!config.enabled) return next();
    try {
      const claims = verifyBearerToken(extractBearer(req.header('authorization')), config);
      if (!hasRequiredScopes(claims, requiredScopes)) {
        throw new CdsAuthError(403, `Missing required scope(s): ${requiredScopes.join(', ')}`);
      }
      req.cdsAuth = claims;
      next();
    } catch (err) {
      deny(res, err);
    }
  };
}

// ── WS-C5 hardened variants (JWKS-by-kid + asymmetric-only) ───────────────────

/** Hardened CDS Hooks guard — async, supports JWKS + `requireAsymmetric`. */
export function cdsHooksAuthHardened(config: CdsAuthConfig) {
  return async (req: CdsAuthedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!config.enabled) return next();
    try {
      req.cdsAuth = await verifyBearerTokenAsync(extractBearer(req.header('authorization')), config);
      next();
    } catch (err) {
      deny(res, err);
    }
  };
}

/** Hardened SMART scope guard — async, supports JWKS + `requireAsymmetric`. */
export function smartScopeAuthHardened(config: CdsAuthConfig, requiredScopes: string[]) {
  return async (req: CdsAuthedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!config.enabled) return next();
    try {
      const claims = await verifyBearerTokenAsync(extractBearer(req.header('authorization')), config);
      if (!hasRequiredScopes(claims, requiredScopes)) {
        throw new CdsAuthError(403, `Missing required scope(s): ${requiredScopes.join(', ')}`);
      }
      req.cdsAuth = claims;
      next();
    } catch (err) {
      deny(res, err);
    }
  };
}

/**
 * Fail-closed validation for a Clinical-tier deployment (WS-C5). Call at startup;
 * throws if clinical auth is mis-hardened. Clinical auth CANNOT be disabled, must
 * be asymmetric-only, must not use an HS256 secret, and must have a key source.
 */
export function assertClinicalAuthHardened(config: CdsAuthConfig): void {
  if (!config.enabled) {
    throw new Error('Clinical auth must be enabled (fail-closed): configure a verification key.');
  }
  if (!config.requireAsymmetric) {
    throw new Error('Clinical auth must require asymmetric algorithms (RS256/ES256).');
  }
  if (config.jwtSecret) {
    throw new Error('HS256 shared secret is forbidden for Clinical auth.');
  }
  if (!config.jwks?.length && !config.jwksUri && !config.jwtPublicKey) {
    throw new Error('Clinical auth requires a JWKS (static or URL) or a public key.');
  }
}

/** Build the CDS auth config from environment variables. */
export function cdsAuthConfigFromEnv(env: NodeJS.ProcessEnv = process.env): CdsAuthConfig {
  const jwtPublicKey = env.CDS_JWT_PUBLIC_KEY?.replace(/\\n/g, '\n');
  const jwtSecret = env.CDS_JWT_SECRET;
  const jwksUri = env.CDS_JWKS_URI;
  const hasKey = Boolean(jwtPublicKey || jwtSecret || jwksUri);
  const explicit = env.CDS_AUTH_ENABLED;
  const enabled = explicit === 'true' ? true : explicit === 'false' ? false : hasKey;

  return {
    enabled,
    jwtPublicKey,
    jwtSecret,
    jwksUri,
    requireAsymmetric: env.CDS_REQUIRE_ASYMMETRIC === 'true' ? true : undefined,
    trustedIssuers: split(env.CDS_TRUSTED_ISSUERS),
    audience: env.CDS_AUDIENCE,
    requiredScopes: split(env.CDS_REQUIRED_SCOPES) ?? ['user/Patient.read'],
    signOffScopes: split(env.CDS_SIGNOFF_SCOPES) ?? ['user/MedicationRequest.write'],
  };
}

function split(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const parts = value.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}
