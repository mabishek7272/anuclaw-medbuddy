/**
 * Content-addressed result cache (Phase 0, WS-B) — gate spec C4 fix.
 *
 * The cache key is partitioned by `tenant_id` AND `tier`, so an identical input
 * from a different tenant is a cache MISS — closing the cross-tenant PHI-derived
 * leakage channel the review flagged. Reference-DB hashes are folded in so a
 * stale ref-DB cannot serve a "valid" cached result.
 *
 * P0 default: full per-tenant partition (fail-safe). RUO public-input sharing is
 * a later, allow-listed optimization, not a default.
 */

import { contentHash } from '../../cds/hashing';
import { EngineResult } from '../types';
import { CacheKeyParts, ResultCache } from './types';

export function cacheKey(parts: CacheKeyParts): string {
  return contentHash({
    tenant_id: parts.tenant_id,
    tier: parts.tier,
    engine_id: parts.engine_id,
    engine_version: parts.engine_version,
    input_hash: parts.input_hash,
    refdb_hashes: [...(parts.refdb_hashes ?? [])].sort(),
  });
}

export class InMemoryResultCache implements ResultCache {
  private readonly store = new Map<string, EngineResult<unknown>>();

  get(key: string): EngineResult<unknown> | undefined {
    return this.store.get(key);
  }

  set(key: string, result: EngineResult<unknown>): void {
    this.store.set(key, result);
  }

  get size(): number {
    return this.store.size;
  }
}
