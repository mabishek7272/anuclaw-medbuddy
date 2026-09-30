/**
 * Consistency Guard (plan §2.2, §3.1 stage 14).
 *
 * Mechanically verifies that a narrative agrees with the arbitrated verdict.
 * Two layers:
 *   A. Structured — the narrator's `assertions` must exactly match the verdict
 *      (decision, drug, gene, phenotype, required directive).
 *   B. Prose — the human text must not contradict the verdict (e.g. a "block"
 *      narrative may not endorse the drug; a "cannot_advise" narrative may not
 *      issue a dosing directive).
 *
 * If ANY check fails the narrative is inconsistent → the service discards and
 * regenerates it (plan §2.2). The decision is never changed to match prose.
 * Pure and deterministic.
 */

import { Verdict } from '../safety/types';
import { normaliseDrug } from '../rule-engine';
import { expectedDirective } from './directive';
import { ConsistencyResult, ExplanationContext, NarrativeDraft } from './types';

const ENDORSEMENT_RE =
  /\b(is recommended|use as prescribed|safe to (use|prescribe)|continue as prescribed|standard dose is appropriate)\b/i;
const AVOIDANCE_RE =
  /\b(avoid|do not|must not|should not|blocked|contraindicated|not be (used|given))\b/i;
const UNAVAILABLE_RE =
  /\b(cannot|unable|insufficient|not able)\b|\bno\b.{0,40}\b(guideline|recommendation)\b/i;
const DOSING_DIRECTIVE_RE =
  /\b(is recommended|use as prescribed|increase the dose|reduce the dose|start (at|with))\b/i;
const STANDARD_DOSE_RE =
  /\b(continue (the )?standard dose|use (the )?standard dose|standard dose is appropriate)\b/i;

export function checkConsistency(
  verdict: Verdict,
  context: ExplanationContext,
  draft: NarrativeDraft,
): ConsistencyResult {
  const v: string[] = [];
  const a = draft.assertions;
  const lc = draft.prose.toLowerCase();
  const exp = expectedDirective(verdict);

  // ── Layer A: assertions vs verdict ──────────────────────────────────────
  if (a.decision !== verdict.decision) {
    v.push(`decision mismatch: narrative asserts '${a.decision}' but verdict is '${verdict.decision}'`);
  }
  if (normaliseDrug(a.drug) !== normaliseDrug(context.drug)) {
    v.push(`drug mismatch: narrative asserts '${a.drug}' but verdict drug is '${context.drug}'`);
  }
  if (verdict.phenotype && a.phenotype && a.phenotype !== verdict.phenotype.phenotype) {
    v.push(`phenotype mismatch: '${a.phenotype}' vs '${verdict.phenotype.phenotype}'`);
  }
  if (
    verdict.phenotype &&
    a.gene &&
    a.gene.toUpperCase() !== verdict.phenotype.gene.toUpperCase()
  ) {
    v.push(`gene mismatch: '${a.gene}' vs '${verdict.phenotype.gene}'`);
  }
  if (a.directive !== exp) {
    v.push(`directive mismatch: narrative asserts '${a.directive}' but verdict requires '${exp}'`);
  }

  // ── Layer B: prose vs verdict ───────────────────────────────────────────
  if (!lc.includes(normaliseDrug(context.drug))) {
    v.push('prose does not mention the prescribed drug');
  }

  if (verdict.decision === 'block') {
    if (!AVOIDANCE_RE.test(lc)) v.push('block narrative lacks an avoidance cue');
    if (ENDORSEMENT_RE.test(lc)) v.push('block narrative contains an endorsement');
  }

  if (verdict.decision === 'cannot_advise' || verdict.decision === 'no_guideline') {
    if (!UNAVAILABLE_RE.test(lc)) v.push('advice-unavailable narrative lacks an unavailability cue');
    if (DOSING_DIRECTIVE_RE.test(lc)) v.push('advice-unavailable narrative contains a dosing directive');
  }

  if (verdict.decision === 'recommend' && exp === 'avoid' && STANDARD_DOSE_RE.test(lc)) {
    v.push('recommendation advises avoidance but narrative endorses the standard dose');
  }

  return { consistent: v.length === 0, violations: v };
}
