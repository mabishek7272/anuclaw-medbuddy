/**
 * Versioned data registry with fail-closed integrity verification.
 *
 * Every gene table and the CPIC rule table is loaded through here. On load the
 * registry recomputes the canonical SHA-256 of the data and compares it to the
 * sealed integrity manifest. Any mismatch — or a missing manifest entry —
 * throws a CdsIntegrityError so the pipeline HALTS rather than evaluating
 * against an unverified data set (plan §3.3, §4.1.3, §4.2.3).
 */

import { GeneDefinition, RuleTable } from './types';
import { contentHash } from './hashing';
import { cyp2d6 } from './data/cyp2d6';
import { cyp2c19 } from './data/cyp2c19';
import { cpicRules } from './data/cpic-rules';
import { integrityManifest } from './data/manifest';
import {
  AllergyRuleTableData,
  ContraindicationRule,
  InteractionRule,
  SafetyRuleTable,
} from './safety/types';
import { contraindications } from './safety/data/contraindications';
import { drugInteractions } from './safety/data/drug-interactions';
import { allergyRules } from './safety/data/allergy-rules';
import { CitationStore } from './evidence/types';
import { citations } from './evidence/data/citations';

/** Raised whenever a data file fails its integrity check. Fail closed. */
export class CdsIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CdsIntegrityError';
  }
}

export interface LoadedGene {
  definition: GeneDefinition;
  integrity: string;
}

export interface LoadedRules {
  table: RuleTable;
  integrity: string;
}

/** All sealed data files, keyed by their `data_id`. */
const GENE_TABLES: Record<string, GeneDefinition> = {
  [cyp2d6.data_id]: cyp2d6,
  [cyp2c19.data_id]: cyp2c19,
};

/** Gene symbol (as it appears in genotypes) → data_id. */
const GENE_SYMBOL_TO_ID: Record<string, string> = {
  CYP2D6: 'cyp2d6',
  CYP2C19: 'cyp2c19',
};

const geneCache = new Map<string, LoadedGene>();
let rulesCache: LoadedRules | null = null;

/** Recompute the integrity hash of a data object. */
export function computeIntegrity(data: unknown): string {
  return contentHash(data);
}

/**
 * Verify a data object against its sealed manifest entry. Throws (fail-closed)
 * if the entry is missing or the hash does not match.
 */
export function assertIntegrity(dataId: string, data: unknown): string {
  const expected = integrityManifest[dataId];
  if (!expected) {
    throw new CdsIntegrityError(
      `No integrity manifest entry for '${dataId}'. Run: tsx scripts/cds-seal.ts`,
    );
  }
  const actual = computeIntegrity(data);
  if (actual !== expected) {
    throw new CdsIntegrityError(
      `Integrity check failed for '${dataId}': expected ${expected}, computed ${actual}. ` +
        `The data file was changed without re-sealing — halting.`,
    );
  }
  return actual;
}

/** Resolve a gene symbol (e.g. 'CYP2D6') to its data_id (e.g. 'cyp2d6'). */
export function resolveGeneId(geneSymbol: string): string | null {
  return GENE_SYMBOL_TO_ID[geneSymbol.trim().toUpperCase()] ?? null;
}

/** Load a verified gene definition by symbol (e.g. 'CYP2D6') or data_id. */
export function loadGene(geneSymbolOrId: string): LoadedGene {
  const dataId =
    GENE_TABLES[geneSymbolOrId] !== undefined
      ? geneSymbolOrId
      : resolveGeneId(geneSymbolOrId);

  if (!dataId || !GENE_TABLES[dataId]) {
    throw new CdsIntegrityError(`Unknown gene: '${geneSymbolOrId}'`);
  }

  const cached = geneCache.get(dataId);
  if (cached) return cached;

  const definition = GENE_TABLES[dataId];
  const integrity = assertIntegrity(dataId, definition);
  const loaded: LoadedGene = { definition, integrity };
  geneCache.set(dataId, loaded);
  return loaded;
}

/** Load the verified CPIC rule table. */
export function loadRules(): LoadedRules {
  if (rulesCache) return rulesCache;
  const integrity = assertIntegrity(cpicRules.data_id, cpicRules);
  rulesCache = { table: cpicRules, integrity };
  return rulesCache;
}

// ── Sealed safety tables ───────────────────────────────────────────────────────

export interface LoadedTable<T> {
  table: T;
  integrity: string;
}

const safetyCache = new Map<string, LoadedTable<unknown>>();

function loadSealed<T extends { data_id: string }>(table: T): LoadedTable<T> {
  const cached = safetyCache.get(table.data_id);
  if (cached) return cached as LoadedTable<T>;
  const integrity = assertIntegrity(table.data_id, table);
  const loaded = { table, integrity };
  safetyCache.set(table.data_id, loaded);
  return loaded;
}

export function loadContraindications(): LoadedTable<
  SafetyRuleTable<ContraindicationRule>
> {
  return loadSealed(contraindications);
}

export function loadInteractions(): LoadedTable<
  SafetyRuleTable<InteractionRule>
> {
  return loadSealed(drugInteractions);
}

export function loadAllergyRules(): LoadedTable<AllergyRuleTableData> {
  return loadSealed(allergyRules);
}

export function loadCitations(): LoadedTable<CitationStore> {
  return loadSealed(citations);
}

/** Test-only: clear caches so integrity behaviour can be re-exercised. */
export function _resetRegistryCache(): void {
  geneCache.clear();
  rulesCache = null;
  safetyCache.clear();
}
