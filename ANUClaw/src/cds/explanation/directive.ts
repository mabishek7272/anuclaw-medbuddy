/**
 * Derive the single clinical directive a faithful narrative must convey from a
 * verdict. Shared by the template provider (to generate) and the consistency
 * guard (to check) so the two cannot drift apart.
 */

import { Verdict } from '../safety/types';
import { Directive } from './types';

const AVOID_RE = /avoid|alternative|do not use|not recommended/i;
const ADJUST_RE = /reduce|lower|50%|adjust|titrate|caution|monitor/i;

export function expectedDirective(verdict: Verdict): Directive {
  switch (verdict.decision) {
    case 'block':
      return 'avoid';
    case 'recommend': {
      const text = verdict.recommendation?.recommendation ?? '';
      if (AVOID_RE.test(text)) return 'avoid';
      if (ADJUST_RE.test(text)) return 'adjust';
      return 'use';
    }
    case 'cannot_advise':
    case 'no_guideline':
    default:
      return 'none';
  }
}
