/**
 * Generalized clinical decision modules (Phase 0, WS-E).
 *
 * The domain-general decision/evidence model + per-domain modules that plug into
 * it, reusing the CDS safety mechanism. First module: oncology combination.
 */

export * from './types';
export { assembleVerdict, OriginationInvariantError } from './arbitrate';
export type { AssembleInput } from './arbitrate';
export { OncologyCombinationModule } from './oncology/module';
export type { OncologyQuery, OncologyContext } from './oncology/module';
export {
  ONCOLOGY_RULES_VERSION,
  regimenRules,
  guidelineCitations,
  organRules,
} from './oncology/data';
export { NeurologyAsmModule } from './neurology/module';
export type { NeurologyQuery, NeurologyContext, NeurologyPatientFactors } from './neurology/module';
export { NEUROLOGY_RULES_VERSION, asmRules, safetyRules } from './neurology/data';
