/**
 * Verdict → CDS Card builder (plan §6.3).
 *
 * Maps an arbitrated verdict + its guarded explanation into a CDS Hooks card:
 *   - indicator: block → critical; cannot_advise/warnings → warning; else info.
 *   - summary:   short, scannable headline.
 *   - detail:    the guard-passed narrative + recommendation + provenance.
 *   - source:    CPIC guideline + version.
 *   - links:     resolvable evidence citations (PMIDs / guideline).
 *
 * The card never asserts anything beyond the verdict — it is a presentation of
 * the deterministic decision, not a new decision.
 */

import { Verdict } from '../safety/types';
import { ExplanationResult } from '../explanation/types';
import { expectedDirective } from '../explanation/directive';
import { CdsCard, CdsIndicator, CdsLink, CdsSource } from '../fhir/types';

export interface CardContext {
  gene: string;
  drug: string;
}

function indicatorFor(verdict: Verdict): CdsIndicator {
  switch (verdict.decision) {
    case 'block':
      return 'critical';
    case 'cannot_advise':
      return 'warning';
    case 'recommend': {
      if (verdict.warnings.length > 0 || verdict.confidence === 'reduced') return 'warning';
      // A guideline that says "avoid / use alternative / adjust" is clinically
      // significant even when nothing is blocked.
      const dir = expectedDirective(verdict);
      return dir === 'avoid' || dir === 'adjust' ? 'warning' : 'info';
    }
    case 'no_guideline':
    default:
      return 'info';
  }
}

function summaryFor(verdict: Verdict, ctx: CardContext): string {
  const pheno = verdict.phenotype ? ` (${ctx.gene} ${verdict.phenotype.phenotype})` : '';
  switch (verdict.decision) {
    case 'block':
      return `PGx ALERT: do not use ${ctx.drug} as prescribed${pheno}`;
    case 'recommend':
      return verdict.warnings.length > 0
        ? `PGx caution: ${ctx.drug}${pheno}`
        : `PGx: ${ctx.drug} guidance available${pheno}`;
    case 'cannot_advise':
      return `PGx: unable to advise on ${ctx.drug}${pheno}`;
    case 'no_guideline':
    default:
      return `PGx: no CPIC guideline for ${ctx.drug}${pheno}`;
  }
}

function sourceFor(verdict: Verdict): CdsSource {
  const version = verdict.recommendation?.cpic_version;
  return {
    label: version ? `CPIC guideline ${version}` : 'ANUClaw v3 CDS',
    url: 'https://cpicpgx.org/guidelines/',
  };
}

function linksFor(verdict: Verdict): CdsLink[] {
  const used = verdict.evidence?.evidence_used ?? [];
  const links: CdsLink[] = [];
  for (const e of used) {
    if (e.pmid) {
      links.push({
        label: `PMID ${e.pmid}`,
        url: `https://pubmed.ncbi.nlm.nih.gov/${e.pmid}/`,
        type: 'absolute',
      });
    }
  }
  return links;
}

function detailFor(
  verdict: Verdict,
  explanation: ExplanationResult,
): string {
  const lines: string[] = [];
  if (explanation.narrative) {
    lines.push(explanation.narrative);
  } else {
    lines.push('_Explanation escalated to human review (narrative withheld)._');
  }
  if (verdict.recommendation) {
    lines.push('', `**Recommendation:** ${verdict.recommendation.recommendation}`);
    lines.push(`**Strength:** ${verdict.recommendation.strength}`);
  }
  if (verdict.blocks.length) {
    lines.push('', `**Safety block:** ${verdict.blocks.map((b) => b.message).join(' ')}`);
  }
  if (verdict.warnings.length) {
    lines.push('', `**Warnings:** ${verdict.warnings.map((w) => w.message).join(' ')}`);
  }
  if (verdict.evidence) {
    lines.push('', `**Evidence confidence:** ${verdict.evidence.confidence_level}`);
  }
  lines.push('', `_Verdict ${verdict.verdict_hash.slice(0, 12)} · ${verdict.reason_code}_`);
  return lines.join('\n');
}

export function verdictToCard(
  verdict: Verdict,
  explanation: ExplanationResult,
  ctx: CardContext,
): CdsCard {
  return {
    uuid: verdict.verdict_hash.slice(0, 32),
    summary: summaryFor(verdict, ctx).slice(0, 140),
    indicator: indicatorFor(verdict),
    detail: detailFor(verdict, explanation),
    source: sourceFor(verdict),
    links: linksFor(verdict),
  };
}
