/**
 * Minimal FHIR R4 + CDS Hooks types (plan §6.1–6.3).
 *
 * Only the slices ANUClaw v3 consumes are modelled — Patient, the genomic and
 * lab Observations, MedicationRequest/Statement, AllergyIntolerance, Condition,
 * and the CDS Hooks request/response/card shapes. Everything is optional because
 * inbound EHR data is untrusted and partial; the normaliser validates it.
 */

// ── FHIR datatypes ─────────────────────────────────────────────────────────────

export interface Coding {
  system?: string;
  code?: string;
  display?: string;
}

export interface CodeableConcept {
  coding?: Coding[];
  text?: string;
}

export interface ObservationComponent {
  code?: CodeableConcept;
  valueCodeableConcept?: CodeableConcept;
  valueString?: string;
}

// ── FHIR resources ─────────────────────────────────────────────────────────────

export interface Patient {
  resourceType?: 'Patient';
  id?: string;
}

export interface Observation {
  resourceType?: 'Observation';
  id?: string;
  status?: string;
  category?: CodeableConcept[];
  code?: CodeableConcept;
  valueCodeableConcept?: CodeableConcept;
  valueString?: string;
  component?: ObservationComponent[];
}

export interface MedicationResource {
  resourceType?: 'MedicationRequest' | 'MedicationStatement';
  id?: string;
  status?: string;
  medicationCodeableConcept?: CodeableConcept;
}

export interface AllergyIntolerance {
  resourceType?: 'AllergyIntolerance';
  id?: string;
  code?: CodeableConcept;
}

export interface Condition {
  resourceType?: 'Condition';
  id?: string;
  code?: CodeableConcept;
}

export interface BundleEntry<T> {
  resource?: T;
}

export interface Bundle<T = unknown> {
  resourceType?: 'Bundle';
  type?: string;
  entry?: BundleEntry<T>[];
}

// ── CDS Hooks ──────────────────────────────────────────────────────────────────

export interface CdsHookContext {
  patientId?: string;
  userId?: string;
  /** order-sign: a Bundle of draft orders (MedicationRequest resources). */
  draftOrders?: Bundle<MedicationResource>;
  /** medication-prescribe (legacy): a Bundle of medications. */
  medications?: Bundle<MedicationResource>;
}

export interface CdsHookRequest {
  hook: string;
  hookInstance?: string;
  context: CdsHookContext;
  /** Prefetched FHIR searchsets, keyed by the discovery prefetch template. */
  prefetch?: Record<string, Bundle | undefined>;
}

export type CdsIndicator = 'info' | 'warning' | 'critical';

export interface CdsLink {
  label: string;
  url: string;
  type: 'absolute' | 'smart';
}

export interface CdsSource {
  label: string;
  url?: string;
}

export interface CdsCard {
  uuid?: string;
  summary: string;
  indicator: CdsIndicator;
  detail?: string;
  source: CdsSource;
  links?: CdsLink[];
}

export interface CdsResponse {
  cards: CdsCard[];
}

/** Discovery descriptor entry returned from `GET /cds-services`. */
export interface CdsServiceDescriptor {
  hook: string;
  id: string;
  title: string;
  description: string;
  prefetch: Record<string, string>;
}
