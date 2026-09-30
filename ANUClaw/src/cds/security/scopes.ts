/**
 * SMART on FHIR scope matching (plan §6.5).
 *
 * A required scope like `user/MedicationRequest.write` is satisfied by a granted
 * scope with wildcards (`user/*.*`, `user/MedicationRequest.*`) and by SMART v2
 * `cruds` action sets (`.cruds`, `.rs`). Context (`user`/`patient`/`system`)
 * must match exactly — we do not widen authority.
 */

import { TokenClaims } from './types';

export function grantedScopes(claims: TokenClaims): string[] {
  const raw = claims.scope ?? claims.scp;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return String(raw).split(/\s+/).filter(Boolean);
}

interface ParsedScope {
  context: string;
  resource: string;
  action: string;
}

function parseScope(scope: string): ParsedScope | null {
  const m = scope.match(/^([^/]+)\/([^.]+)\.(.+)$/);
  return m ? { context: m[1], resource: m[2], action: m[3] } : null;
}

const V1_TO_CRUD: Record<string, string[]> = {
  read: ['r', 's'],
  write: ['c', 'u', 'd'],
  '*': ['c', 'r', 'u', 'd', 's'],
};

function expandAction(action: string): string[] {
  if (V1_TO_CRUD[action]) return V1_TO_CRUD[action];
  return action.split(''); // v2 cruds, e.g. 'rs' → ['r','s']
}

function actionCovers(granted: string, required: string): boolean {
  if (granted === '*' || granted === required) return true;
  const g = expandAction(granted);
  return expandAction(required).every((letter) => g.includes(letter));
}

/** Does a single granted scope satisfy a required scope? */
export function scopeSatisfies(granted: string, required: string): boolean {
  if (granted === required) return true;
  const g = parseScope(granted);
  const r = parseScope(required);
  if (!g || !r) return false; // non-SMART scopes match by exact string only
  if (g.context !== r.context) return false;
  const resourceOk = g.resource === '*' || g.resource === r.resource;
  return resourceOk && actionCovers(g.action, r.action);
}

/** Are all required scopes satisfied by the token's granted scopes? */
export function hasRequiredScopes(claims: TokenClaims, required: string[]): boolean {
  const granted = grantedScopes(claims);
  return required.every((req) => granted.some((g) => scopeSatisfies(g, req)));
}
