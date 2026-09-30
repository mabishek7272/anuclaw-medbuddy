import { describe, it, expect } from 'vitest';
import { groundEvidence } from './evidence-engine';
import { arbitrate } from '../safety/arbitrator';
import { Citation, CitationStore } from './types';
import { CpicRule, PhenotypeAssignment, RuleLookupResult } from '../types';
import { SafetyResult } from '../safety/types';

// ── Fixtures ────────────────────────────────────────────────────────────────

function rule(overrides: Partial<CpicRule> = {}): CpicRule {
  return {
    gene: 'CYP2C19',
    drug: 'clopidogrel',
    phenotype: 'Poor Metabolizer',
    recommendation: 'Avoid standard dose.',
    strength: 'Strong',
    cpic_version: '2022.1',
    citation_ids: ['cpic_clopidogrel_2022', 'pmid_placeholder_clopidogrel'],
    effective_date: '2022-01-01',
    ...overrides,
  };
}

function citation(overrides: Partial<Citation>): Citation {
  return {
    id: 'c1',
    source: 'CPIC',
    guideline_version: '2022.1',
    strength: 'Strong',
    title: 't',
    statement: 's',
    supports: true,
    ...overrides,
  };
}

function store(citations: Record<string, Citation>): {
  table: CitationStore;
  integrity: string;
} {
  return {
    table: { data_id: 'citations', version: 'test', source: 's', notice: 'n', citations },
    integrity: 'a'.repeat(64),
  };
}

// ── Engine behaviour ──────────────────────────────────────────────────────────

describe('evidence engine (plan §4.3, §5.2)', () => {
  it('grounds a real rule against the sealed store', () => {
    const r = groundEvidence({ recommendation_id: 'rec-1', rule: rule() });
    expect(r.status).toBe('grounded');
    expect(r.evidence.confidence_level).toBe('High'); // Strong -> High
    expect(r.evidence.rules_triggered).toEqual(['cyp2c19_clopidogrel_pm']);
    expect(r.evidence.evidence_used.length).toBe(2);
    expect(r.evidence.uncertainty).toMatch(/None for this gene-drug-phenotype/i);
  });

  it('BLOCKS when a citation cannot be resolved (no-citation block)', () => {
    const r = groundEvidence({
      recommendation_id: 'rec-2',
      rule: rule({ citation_ids: ['cpic_clopidogrel_2022', 'does_not_exist'] }),
    });
    expect(r.status).toBe('blocked');
    expect(r.missing_citation_ids).toContain('does_not_exist');
  });

  it('BLOCKS on a guideline version-pinning mismatch', () => {
    const s = store({
      c_old: citation({ id: 'c_old', guideline_version: '2018.1' }),
    });
    const r = groundEvidence(
      { recommendation_id: 'rec-3', rule: rule({ citation_ids: ['c_old'] }) },
      s,
    );
    expect(r.status).toBe('blocked');
    expect(r.reason).toMatch(/version mismatch/i);
  });

  it('flags a CONTRADICTION when a source disagrees (routes to human)', () => {
    const s = store({
      c_against: citation({ id: 'c_against', supports: false }),
    });
    const r = groundEvidence(
      { recommendation_id: 'rec-4', rule: rule({ citation_ids: ['c_against'] }) },
      s,
    );
    expect(r.status).toBe('contradiction');
    expect(r.reason).toMatch(/disagree/i);
  });

  it('maps recommendation strength to confidence (Moderate, Optional)', () => {
    const mod = groundEvidence({
      recommendation_id: 'rec-5',
      rule: rule({ strength: 'Moderate', citation_ids: ['cpic_clopidogrel_2022'] }),
    });
    expect(mod.evidence.confidence_level).toBe('Moderate');

    const opt = groundEvidence({
      recommendation_id: 'rec-6',
      rule: rule({ strength: 'Optional', citation_ids: ['cpic_clopidogrel_2022'] }),
    });
    expect(opt.evidence.confidence_level).toBe('Low');
  });
});

// ── Arbitration integration ───────────────────────────────────────────────────

const phenotype: PhenotypeAssignment = {
  gene: 'CYP2C19',
  diplotype: '*2/*2',
  phenotype: 'Poor Metabolizer',
  activity_score: null,
  method: 'diplotype_function',
  indeterminate: false,
  reason: null,
  rule_version: '2024.1',
  table_hash: 'b'.repeat(64),
};

const recommendation: RuleLookupResult = {
  status: 'recommendation',
  rule: rule(),
  table_version: '2024.1',
  table_hash: 'c'.repeat(64),
};

const cleanMissingData: SafetyResult = {
  engine: 'missing_data',
  status: 'pass',
  findings: [],
  rule_version: '',
  table_hash: '',
};

describe('arbitrator — evidence gating', () => {
  it('ungrounded evidence forces cannot_advise (evidence_unavailable)', () => {
    const evidence = groundEvidence({
      recommendation_id: 'rec',
      rule: rule({ citation_ids: ['missing'] }),
    });
    const v = arbitrate({
      phenotype,
      recommendation,
      evidence,
      safety: [cleanMissingData],
    });
    expect(v.decision).toBe('cannot_advise');
    expect(v.reason_code).toBe('evidence_unavailable');
    expect(v.recommendation).toBeNull();
    expect(v.evidence).toBeNull(); // not presented when not grounded
  });

  it('grounded evidence recommends and attaches the evidence object', () => {
    const evidence = groundEvidence({ recommendation_id: 'rec', rule: rule() });
    const v = arbitrate({
      phenotype,
      recommendation,
      evidence,
      safety: [cleanMissingData],
    });
    expect(v.decision).toBe('recommend');
    expect(v.evidence?.confidence_level).toBe('High');
  });
});
