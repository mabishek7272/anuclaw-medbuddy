/**
 * Deterministic template provider (plan §3.3 "template explanation").
 *
 * Builds a plain-language narrative directly from the verdict's structured
 * fields, so it is faithful by construction and always passes the consistency
 * guard. It is the default narrator, the §3.3 fallback when an injected LLM is
 * unavailable, and the safe text when an LLM is escalated. Uses no model.
 */

import { Verdict } from '../safety/types';
import { ExplanationContext, ExplanationProvider, NarrativeDraft } from './types';
import { expectedDirective } from './directive';

function phenotypeClause(verdict: Verdict, context: ExplanationContext): string {
  if (!verdict.phenotype) return '';
  return ` based on the patient's ${context.gene} ${verdict.phenotype.phenotype} status`;
}

export function renderTemplate(
  verdict: Verdict,
  context: ExplanationContext,
): NarrativeDraft {
  const drug = context.drug;
  const directive = expectedDirective(verdict);
  let prose: string;

  switch (verdict.decision) {
    case 'recommend': {
      const rec = verdict.recommendation?.recommendation ?? '';
      const strength = verdict.recommendation?.strength
        ? ` (CPIC strength: ${verdict.recommendation.strength}.)`
        : '';
      prose =
        `For ${drug}${phenotypeClause(verdict, context)}, the guideline advises: ${rec}` +
        `${strength}` +
        (verdict.warnings.length
          ? ` Note the following warning(s): ${verdict.warnings.map((w) => w.message).join(' ')}`
          : '');
      break;
    }
    case 'block': {
      const reasons = verdict.blocks.map((b) => b.message).join(' ');
      prose =
        `Do not proceed with ${drug} as prescribed. A safety check blocked this order: ${reasons} ` +
        `This block overrides any dosing recommendation.`;
      break;
    }
    case 'no_guideline': {
      prose =
        `No applicable CPIC guideline is available for ${drug}${phenotypeClause(verdict, context)}. ` +
        `No pharmacogenomic recommendation can be made; proceed per standard clinical judgment.`;
      break;
    }
    case 'cannot_advise':
    default: {
      const why = cannotAdviseReason(verdict);
      prose =
        `Unable to provide a pharmacogenomic recommendation for ${drug}: ${why} ` +
        `No dosing directive is given; please review manually.`;
      break;
    }
  }

  return {
    prose,
    assertions: {
      decision: verdict.decision,
      drug,
      gene: verdict.phenotype?.gene,
      phenotype: verdict.phenotype?.phenotype,
      directive,
    },
  };
}

function cannotAdviseReason(verdict: Verdict): string {
  switch (verdict.reason_code) {
    case 'missing_data':
      return 'required patient data is missing or unverified.';
    case 'indeterminate_phenotype':
      return 'the genotype yields an indeterminate phenotype (routed to a pharmacist).';
    case 'evidence_unavailable':
      return 'the supporting guideline citation could not be retrieved.';
    case 'evidence_contradiction':
      return 'the supporting sources disagree (routed to human review).';
    default:
      return 'a required precondition was not met.';
  }
}

/** The default, always-available narrator. */
export const deterministicTemplateProvider: ExplanationProvider = {
  name: 'deterministic-template',
  generate: ({ verdict, context }) => renderTemplate(verdict, context),
};
