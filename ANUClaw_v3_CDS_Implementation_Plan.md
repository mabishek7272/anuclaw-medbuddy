ANUClaw v3 — Hospital-Grade CDS Implementation Plan	AMGI Research · June 2026

**ANUClaw v3**

**Hospital-Grade Clinical Decision Support**

*Full Implementation Plan*

Pipelines · Workflows · Engines · Validation · Regulatory


A deterministic-first, evidence-grounded, regulator-ready

clinical decision support platform — built step by step.

**AMGI Research — Abi and Anu Research Initiative**

Version 1.0 · June 2026 · Engineering & Regulatory Build Plan

**CRITICAL PRINCIPLE: In ANUClaw v3, deterministic rules make every clinical decision. The LLM generates language and explanations only. It never decides a phenotype, a dose, a contraindication, or a recommendation. Safety rules always override model output.**








# **1. Executive Summary & Scope**


*This document is the complete, step-by-step build plan for ANUClaw v3 — the regulated, hospital-grade clinical decision support (CDS) system. It is written to be executed: every pipeline, engine, workflow, validation gate, and regulatory artifact is specified concretely enough for an engineering and regulatory team to begin work.*

## **1.1 What v3 Is**
ANUClaw v3 is a Software as a Medical Device (SaMD) clinical decision support system. It accepts patient data from a hospital EHR, runs that data through deterministic clinical rule engines, grounds every recommendation in cited evidence, validates outputs against hard safety rules, and presents the result to a clinician for review. The large language model is confined to a single, tightly-bounded role: turning a deterministic decision into a clear, plain-language explanation.

## **1.2 What v3 Is NOT**
- It is not autonomous — every clinical recommendation is reviewed by a qualified clinician before action.
- It is not LLM-driven — the model never makes a safety-critical decision.
- It is not the broad 1,400-skill platform — v3 is a narrow, deeply validated clinical core.
- It is not a diagnostic device in v3.0 — the initial indication is pharmacogenomic dosing guidance support.

## **1.3 Initial Clinical Indication (v3.0)**
Following the AIRD Chief recommendation, the first validated indication is deliberately narrow:

**Pharmacogenomic dosing decision support for CYP2D6 and CYP2C19 substrate medications, based on CPIC guidelines, with deterministic phenotype assignment and mandatory clinician review.**

Once this indication achieves clinical validation, regulatory clearance, and real-world deployment, the same validated architecture expands to additional gene-drug pairs and, later, additional clinical domains.

## **1.4 Software Safety Classification**
Under IEC 62304, ANUClaw v3 is classified as Class C software: a failure or latent defect could lead to death or serious injury (incorrect pharmacogenomic guidance could cause an adverse drug reaction). Class C imposes the most rigorous lifecycle requirements, which this plan is built to satisfy.

## **1.5 Document Structure**

|**Section**|**Contents**|
| :- | :- |
|2 — Architecture|The deterministic-first system architecture and component map|
|3 — Master Pipeline|End-to-end request lifecycle from EHR to clinician|
|4 — Core Engines|Phenotype, rule, evidence, and safety engines in detail|
|5 — Critical Workflows|Safety arbitration, evidence grounding, human-in-the-loop, audit|
|6 — Data & Interoperability|FHIR R4, HL7, SMART on FHIR, data model|
|7 — Safety Architecture|Contraindication, interaction, allergy, missing-data engines|
|8 — Validation Framework|Technical, clinical, safety, and regulatory validation gates|
|9 — Regulatory Plan|IEC 62304, ISO 13485/14971, FDA, the full document set|
|10 — Implementation Phases|Step-by-step phased build with deliverables and acceptance criteria|
|11 — Team & Governance|Roles, responsibilities, and decision authority|
|12 — Testing & QA|Test strategy across every layer|
|13 — Deployment & Operations|Release, monitoring, incident response, change control|
|14 — Risk Management|Hazard analysis and mitigation|
|Appendices|Rule schema, data model, traceability template, glossary|


# **2. System Architecture**


*The architecture inverts the usual LLM-application pattern. Instead of an LLM calling tools, deterministic engines make decisions and the LLM is one constrained, non-authoritative component at the end.*

## **2.1 Architectural Layers**

|**Layer**|**Responsibility**|**Authority Over Clinical Output**|
| :- | :- | :- |
|Interoperability layer|FHIR/HL7 ingestion and egress with the hospital EHR|None — transport only|
|Patient context layer|Assemble a normalised, validated patient snapshot|None — data only|
|Deterministic decision core|Phenotype engine + rule engine — makes the decision|FULL — this layer decides|
|Evidence layer|Retrieve and attach cited guideline evidence|Grounding only|
|Safety layer|Hard rule checks: contraindication, interaction, allergy|OVERRIDE — can block any output|
|Arbitration layer|Reconcile decision, evidence, and safety into one verdict|Final gate before human|
|Explanation layer (LLM)|Generate plain-language narrative of the decision|None — narrates only, cannot alter|
|Clinical oversight layer|Clinician review, accept/modify/reject, sign-off|Human authority — final|
|Audit layer|Immutable, attributable log of every step|None — records only|

## **2.2 The Authority Hierarchy**
The single most important architectural rule is the authority hierarchy — the fixed order in which components can influence the final clinical output:

1\. Safety rules        (can BLOCK anything — highest authority)

2\. Deterministic rules (MAKE the clinical decision)

3\. Evidence engine     (GROUNDS the decision in citations)

4\. LLM explanation     (DESCRIBES the decision — lowest authority)

5\. Clinician           (REVIEWS and holds final human authority)

**If the LLM explanation ever contradicts the deterministic decision, the system treats this as a critical fault, discards the explanation, logs the event, and regenerates. The decision is never changed to match the explanation.**

## **2.3 Component Inventory**

|**Component**|**Type**|**Build Approach**|
| :- | :- | :- |
|FHIR Gateway|Service|SMART on FHIR client; HAPI FHIR or Medplum|
|HL7 Interface Engine|Service|Mirth Connect / custom HL7v2 parser|
|Patient Context Assembler|Service|Normalises genotype, meds, allergies, labs|
|Genotype Normaliser|Library|Star-allele standardisation (PharmCAT-aligned)|
|Deterministic Phenotype Engine|Library|Pure function: diplotype → phenotype lookup|
|CPIC Rule Engine|Library + DB|Versioned guideline rule tables|
|Clinical Evidence Engine|Service|Citation-grounded retrieval + ranking|
|Contraindication Engine|Library + DB|Hard rule set|
|Drug Interaction Engine|Library + DB|DDI rule set + severity|
|Allergy Validation Engine|Library|Cross-sensitivity rules|
|Missing-Data Detector|Library|Required-field completeness checks|
|Safety Arbitrator|Service|Reconciles all engine outputs|
|LLM Explanation Service|Service|Constrained generation with guardrails|
|Clinician Review UI|Application|Web app within EHR (SMART launch)|
|Audit Service|Service|Append-only, hash-chained log|
|Rule Authoring & Versioning|Application|Governed change control for rule tables|


# **3. The Master CDS Pipeline**


*Every request follows the same deterministic pipeline. No step may be skipped. Each step writes to the audit log before passing control to the next.*

## **3.1 End-to-End Stages**

|**#**|**Stage**|**Input**|**Output**|**Audit Event**|
| :- | :- | :- | :- | :- |
|1|Trigger|New prescription / order in EHR|CDS request created|request.created|
|2|Ingestion|FHIR Bundle from EHR|Raw patient data|data.ingested|
|3|Context assembly|Raw data|Normalised patient snapshot|context.assembled|
|4|Completeness check|Patient snapshot|Pass / missing-data flag|completeness.checked|
|5|Genotype normalisation|Star alleles|Standard diplotype|genotype.normalised|
|6|Phenotype assignment|Diplotype|Deterministic phenotype|phenotype.assigned|
|7|Rule evaluation|Phenotype + drug|Guideline recommendation|rule.evaluated|
|8|Evidence retrieval|Recommendation|Cited evidence set|evidence.retrieved|
|9|Contraindication check|Recommendation + patient|Pass / block|contraindication.checked|
|10|Interaction check|Drug + active meds|Pass / interaction flag|interaction.checked|
|11|Allergy check|Drug + allergy list|Pass / allergy block|allergy.checked|
|12|Safety arbitration|All engine outputs|Final verdict|arbitration.completed|
|13|Explanation|Verdict + evidence|Plain-language narrative|explanation.generated|
|14|Consistency guard|Narrative vs verdict|Pass / regenerate|consistency.verified|
|15|Delivery|Verdict + narrative|CDS card to clinician|cds.delivered|
|16|Clinician review|CDS card|Accept / modify / reject|clinician.actioned|
|17|Write-back|Clinician decision|FHIR write to EHR|ehr.updated|
|18|Close|—|Audit finalised + signed|request.closed|

## **3.2 Pipeline Invariants**
These properties must hold for every single request, enforced in code and verified in testing:

- No clinical output is produced if the completeness check (stage 4) fails — the system returns a 'cannot advise: missing data' result instead.
- Stage 6 (phenotype) is a pure deterministic function — identical input always produces identical output, with zero model involvement.
- Stages 9–11 (safety checks) run independently and any single one can block the entire output.
- Stage 14 discards and regenerates any explanation that does not match the arbitrated verdict; after N failures it escalates to a human with no narrative.
- Every stage writes its audit event before control passes; an audit write failure halts the pipeline.
- No stage may call an external network resource that has not been allowlisted and version-pinned.

## **3.3 Failure Handling Per Stage**

|**Failure Mode**|**System Behaviour**|
| :- | :- |
|EHR data unreachable|Return 'CDS unavailable'; do not guess; log + alert|
|Missing required genotype|Return 'cannot advise: genotype required'; suggest test|
|Unknown / novel allele|Return 'indeterminate phenotype'; route to pharmacist|
|Rule table version mismatch|Halt; never evaluate against an unverified rule set|
|Evidence retrieval empty|Block recommendation; a guideline rule must have a citation|
|Safety engine timeout|Fail closed — block output, never fail open|
|LLM unavailable / low confidence|Deliver decision with a template explanation, flagged|
|Audit write failure|Halt pipeline; no clinical output without an audit record|

**Fail-closed is mandatory everywhere safety is concerned. When any safety-relevant component is uncertain or unavailable, the system blocks the output rather than risk an unsafe recommendation.**


# **4. Core Engines (Detailed Specification)**


## **4.1 Deterministic Phenotype Engine**
This engine converts a normalised diplotype (the pair of star alleles a patient carries) into a metabolizer phenotype. It is the heart of the safety argument and contains no machine learning of any kind.

### **4.1.1 Behaviour**
- Input: a standardised diplotype, e.g. CYP2D6 \*1/\*4.
- Process: deterministic lookup against an activity-score table derived from CPIC allele functional status.
- Output: a discrete phenotype — Ultrarapid, Normal, Intermediate, or Poor Metabolizer — plus the activity score and the exact rule version used.
- Property: referentially transparent — the same diplotype always yields the same phenotype, forever, for a given rule version.

### **4.1.2 Activity Score Method**
CYP2D6 example:

`  `\*1  = 1.0 (normal function)

`  `\*2  = 1.0 (normal function)

`  `\*4  = 0.0 (no function)

`  `\*10 = 0.25 (decreased function)

Diplotype activity score = allele\_1 + allele\_2

`  `\*1/\*4  = 1.0 + 0.0 = 1.0  -> Intermediate Metabolizer

`  `\*1/\*1  = 1.0 + 1.0 = 2.0  -> Normal Metabolizer

`  `\*4/\*4  = 0.0 + 0.0 = 0.0  -> Poor Metabolizer

### **4.1.3 Hard Requirements**
- The activity-score table is a versioned, signed data file under change control — never code constants edited ad hoc.
- Novel or unannotated alleles return 'indeterminate' — never a guessed phenotype.
- Every assignment records: input diplotype, activity score, phenotype, table version, and a hash of the table.
- 100% of phenotype assignments must be reproducible from the audit log alone.

## **4.2 CPIC Rule Engine**
This engine takes the deterministic phenotype and the prescribed drug, and returns the guideline recommendation. It is a versioned rule table, not a model.

### **4.2.1 Rule Structure**
Rule = {

`  `gene:           'CYP2C19',

`  `drug:           'clopidogrel',

`  `phenotype:      'Poor Metabolizer',

`  `recommendation: 'Avoid standard dose; consider alternative

`                   `antiplatelet (e.g. prasugrel/ticagrelor)',

`  `strength:       'Strong',

`  `cpic\_version:   '2022.1',

`  `citation\_ids:   ['cpic\_clopidogrel\_2022', 'pmid\_xxxxxxx']

}

### **4.2.2 Behaviour**
- Exact-match lookup on (gene, drug, phenotype) — no fuzzy matching, no inference.
- If no rule exists for the triple, the engine returns 'no guideline available' — it never extrapolates.
- Each rule carries its guideline version and citation IDs, which flow into evidence and audit.
- A guideline-precedence policy resolves the rare case of overlapping guidance from multiple sources.

### **4.2.3 Versioned Guideline Registry**
Every CPIC guideline release is ingested as a new immutable version. Recommendations record exactly which version produced them, so a recommendation made last year can be reproduced and explained even after the guideline updates.

## **4.3 Clinical Evidence Engine**
Every recommendation must be traceable to a source. This engine attaches the specific guideline text and primary-literature citations that justify the rule that fired.

|**Capability**|**Specification**|
| :- | :- |
|Citation-level grounding|Each recommendation links to specific guideline sections + PMIDs|
|Source confidence scoring|Evidence strength graded per CPIC (Strong / Moderate / Optional)|
|Contradiction detection|Flags when sources disagree; routes to human|
|Guideline precedence|Deterministic policy when multiple guidelines apply|
|Version pinning|Evidence pinned to the guideline version that fired the rule|
|No-citation block|A recommendation with no retrievable citation is blocked|

**A guideline recommendation that cannot produce its supporting citation is treated as a fault and blocked. Grounding is mandatory, not best-effort.**

### **4.3.1 Evidence Output Object**
Evidence = {

`  `recommendation\_id: '...',

`  `rules\_triggered:   ['cyp2c19\_clopidogrel\_pm'],

`  `evidence\_used:     [{source:'CPIC 2022.1', section:'4.2',

`                       `strength:'Strong', pmid:'...'}],

`  `confidence\_level:  'High',

`  `uncertainty:       'None for this gene-drug-phenotype triple'

}


# **5. Critical Workflows**


*Four workflows carry the safety and trust guarantees of the system: safety arbitration, evidence grounding, human-in-the-loop review, and audit. Each is specified as an ordered procedure.*

## **5.1 Safety Arbitration Workflow**
The arbitrator is the final automated gate. It collects the outputs of the decision core and every safety engine and produces one verdict. Safety always wins.

1. **Step 1:** Collect the deterministic recommendation from the rule engine.
1. **Step 2:** Collect results from the contraindication, interaction, and allergy engines.
1. **Step 3:** Collect the missing-data detector result.
1. **Step 4:** If ANY safety engine returns a BLOCK, the verdict is BLOCK regardless of the recommendation.
1. **Step 5:** If any safety engine returns a WARNING, attach it to the verdict and lower the auto-confidence.
1. **Step 6:** If all clear, the verdict is the deterministic recommendation, with evidence attached.
1. **Step 7:** Stamp the verdict with all engine versions, timestamps, and a verdict hash.
1. **Step 8:** Emit arbitration.completed to the audit log before passing to the explanation layer.

|**Arbitration Input**|**Possible Values**|**Effect on Verdict**|
| :- | :- | :- |
|Rule recommendation|Recommend / no-guideline|Basis of verdict if safe|
|Contraindication|Pass / block|Block overrides everything|
|Drug interaction|Pass / warn / block|Block overrides; warn annotates|
|Allergy|Pass / block|Block overrides everything|
|Missing data|Complete / incomplete|Incomplete -> cannot advise|

## **5.2 Evidence Grounding Workflow**
1. **Step 1:** Receive the rule(s) that fired and their citation IDs.
1. **Step 2:** Resolve each citation ID against the pinned guideline-version store.
1. **Step 3:** Retrieve the exact guideline section text and any linked primary literature.
1. **Step 4:** Grade evidence strength from the guideline's own classification.
1. **Step 5:** Run contradiction detection across the retrieved sources.
1. **Step 6:** If any citation fails to resolve, block the recommendation and log evidence.missing.
1. **Step 7:** Assemble the evidence object and attach it to the verdict.

## **5.3 Human-in-the-Loop Clinical Review Workflow**
No recommendation reaches the patient without a qualified clinician's review. The review UI presents the verdict, the evidence, and the explanation, and records the clinician's decision with attribution.

1. **Step 1:** The CDS card surfaces in the clinician's EHR workflow at the point of prescribing.
1. **Step 2:** The card shows: the recommendation, the phenotype and how it was derived, the evidence with citations, any safety warnings, and the plain-language explanation.
1. **Step 3:** The clinician chooses one of: Accept, Accept with modification, or Reject (override).
1. **Step 4:** If the clinician overrides, the system requires a structured reason (captured for audit and quality review).
1. **Step 5:** The decision, the clinician identity, the timestamp, and any override reason are written to the audit log.
1. **Step 6:** Only after clinician sign-off does any write-back to the EHR occur.

**ANUClaw v3 supports the clinician; it never acts on the patient autonomously. Override is always available, and override reasons feed continuous safety monitoring.**

## **5.4 Audit Workflow**
Auditability is what makes the system adoptable in a regulated hospital. Every stage emits an immutable, attributable record.

|**Audit Property**|**Implementation**|
| :- | :- |
|Immutability|Append-only store; records never updated or deleted|
|Integrity|Hash-chained entries; tamper-evident|
|Attribution|Every entry carries actor (system component or clinician)|
|Reproducibility|Inputs + versions logged so any decision can be re-derived|
|Completeness|Pipeline halts if an audit write fails|
|Retention|7-year retention aligned to clinical-records requirements|
|Export|Signed bundle export for regulatory and legal review|
|Electronic signature|21 CFR Part 11 compliant clinician sign-off|


# **6. Data & Interoperability Layer**


*v3 must speak the hospital's language. That means HL7 v2 for legacy messaging, FHIR R4 for modern data exchange, and SMART on FHIR for secure, in-context launch inside the EHR.*

## **6.1 Interoperability Standards**

|**Standard**|**Role in v3**|**Priority**|
| :- | :- | :- |
|FHIR R4|Primary data model for patient, observation, medication|Phase 1|
|SMART on FHIR|Secure app launch + OAuth2 scoped access inside the EHR|Phase 1|
|HL7 v2|Ingest orders/results from legacy hospital systems|Phase 2|
|CDS Hooks|Standard trigger when a clinician prescribes|Phase 1|
|Bulk FHIR ($export)|Population-level genotype data loads|Phase 3|
|US Core / IPS profiles|Conformance to required data profiles|Phase 2|

## **6.2 Key FHIR Resources Consumed**

|**FHIR Resource**|**Used For**|
| :- | :- |
|Patient|Identity, demographics, the Universal Patient UID anchor|
|Observation (genomics)|Star-allele / diplotype genotype results|
|MedicationRequest|The drug being prescribed (the trigger)|
|MedicationStatement|Active medication list for interaction checking|
|AllergyIntolerance|Allergy list for allergy validation|
|Condition|Comorbidities relevant to contraindications|
|Observation (labs)|Renal/hepatic function for dose-relevant context|

## **6.3 CDS Hooks Integration**
ANUClaw v3 registers as a CDS Hooks service. When a clinician signs or selects a medication, the EHR fires a hook, ANUClaw runs the pipeline, and returns a CDS Card. This is the cleanest, most EHR-native trigger and avoids screen-scraping or manual launch.

Hook: order-sign  /  order-select

Request:  { patient, prefetch: { genotype, meds, allergies } }

Response: CDS Card {

`            `summary, indicator (info|warning|critical),

`            `detail (recommendation + explanation),

`            `source (CPIC guideline + version),

`            `links (evidence citations) }

## **6.4 Patient Data Model (Internal)**
Inbound FHIR is normalised into an internal patient snapshot — a single validated object the pipeline operates on, decoupled from FHIR's verbosity.

PatientSnapshot = {

`  `uid, demographics,

`  `genotypes: [{gene, diplotype, source, assay, date}],

`  `prescribed\_drug: {code, name, dose, route},

`  `active\_medications: [...],

`  `allergies: [...],

`  `conditions: [...],

`  `relevant\_labs: {renal, hepatic},

`  `completeness: {required:[...], present:[...], missing:[...]}

}

## **6.5 Security at the Data Layer**
- SMART on FHIR OAuth2 with least-privilege scopes; no broad EHR access.
- All PHI encrypted at rest (AES-256, per-tenant keys) and in transit (TLS 1.3).
- Row-level security so a request can only see its own patient's data.
- Every data access is logged and attributable (break-glass requires justification).
- Data residency pinning for jurisdictions that require it.


# **7. Clinical Safety Architecture**


*Four independent safety engines run on every recommendation. Each is a hard, deterministic rule set. Any one of them can block an output. None of them is an LLM.*

## **7.1 Contraindication Engine**
- Checks the recommended action against patient conditions and the drug's absolute/relative contraindications.
- Sourced from curated, versioned contraindication tables (e.g. drug label + clinical references).
- Absolute contraindication -> hard BLOCK with explanation.
- Relative contraindication -> WARNING attached to the verdict.

## **7.2 Drug-Drug Interaction Engine**
- Cross-checks the prescribed drug against the active medication list.
- Versioned DDI rule set with severity grading (contraindicated / major / moderate).
- Contraindicated combination -> BLOCK; major -> WARNING requiring acknowledgement.
- Especially important in PGx: a poor metabolizer plus an interacting inhibitor compounds risk.

## **7.3 Allergy Validation Engine**
- Matches the drug and its class against the patient allergy list.
- Includes cross-sensitivity rules (e.g. drug-class cross-reactivity).
- Documented allergy match -> BLOCK; possible cross-sensitivity -> WARNING.

## **7.4 Missing-Data Detector**
- Verifies every field required for a safe recommendation is present and valid.
- Missing genotype, missing active-med list, or stale data -> 'cannot advise' rather than a guess.
- Distinguishes 'absent' from 'confirmed none' (e.g. confirmed no known allergies).

## **7.5 Safety Engine Properties**

|**Property**|**Requirement**|
| :- | :- |
|Independence|Engines run separately; no shared failure mode|
|Determinism|Same input -> same result, always|
|Fail-closed|Uncertain or unavailable -> block, never allow|
|Versioned rules|All rule sets under signed change control|
|Override authority|Safety BLOCK overrides the clinical recommendation|
|Auditability|Every check and result logged with rule version|

**Critical principle (restated): safety rules always override LLM output — and they also override the deterministic recommendation. Nothing reaches the clinician as 'recommended' if a safety engine says block.**


# **8. Validation Framework**


*No module becomes clinical-grade without passing four sequential validation gates. This is the mechanism that turns an engineering prototype into a credible clinical tool.*

## **8.1 The Four Gates**

|**Gate**|**Question Answered**|**Owner**|
| :- | :- | :- |
|1\. Technical validation|Does the software do what the spec says, correctly?|Engineering + QA|
|2\. Clinical validation|Does it agree with expert clinical judgment?|Clinical team|
|3\. Safety validation|Does it fail safely and block unsafe outputs?|Safety + clinical|
|4\. Regulatory validation|Is it documented and controlled to standard?|Regulatory/QA|

## **8.2 Gate 1 — Technical Validation**
- Unit tests for every engine with full branch coverage on safety paths.
- Property-based tests asserting phenotype determinism (same input -> same output across thousands of cases).
- Golden-dataset tests: a fixed set of diplotypes with known correct phenotypes, must pass 100%.
- Pipeline integration tests covering every failure mode in section 3.3.
- Acceptance: 100% pass on safety-critical paths; no Class C defect open.

## **8.3 Gate 2 — Clinical Validation**
The headline study from the roadmap: concordance with expert pharmacogenomic review.

- Assemble a validation dataset of real (de-identified) or expertly-constructed genotype-drug cases.
- Independent pharmacogenomics experts (clinical pharmacists / clinical geneticists) assign the correct recommendation, blinded to the system.
- Run the system on the same cases; compute concordance.

**Success metric: greater than or equal to 99% concordance with expert pharmacogenomic review on the validation dataset. Every discordance is investigated and resolved before release.**

- Discordance analysis: each disagreement is root-caused (data, rule, or expert error) and documented.
- Acceptance: concordance threshold met AND zero unresolved discordances on safety-relevant cases.

## **8.4 Gate 3 — Safety Validation**
- Adversarial / edge-case testing: novel alleles, conflicting data, contraindicated combinations, missing fields.
- Confirm fail-closed behaviour for every safety-relevant failure mode.
- Confirm safety engines correctly BLOCK known-unsafe scenarios from a curated hazard test set.
- Confirm the consistency guard catches injected explanation/verdict mismatches.

**Success metric: critical recommendation error rate below the pre-defined accepted threshold, with zero unsafe outputs reaching the clinician in the hazard test set.**

## **8.5 Gate 4 — Regulatory Validation**
- Traceability matrix complete: every requirement -> design -> code -> test.
- Risk file current: every identified hazard has an analysed, mitigated, and verified control.
- Verification and validation plans executed with signed evidence.
- Design History File assembled and reviewable.
- Acceptance: independent QA sign-off that the design dossier meets IEC 62304 Class C and ISO 13485.


# **9. Regulatory & Quality Plan**


*Hospitals and regulators do not buy capability — they buy controlled, documented, validated evidence. This section defines the standards, the document set, and the quality system.*

## **9.1 Applicable Standards**

|**Standard**|**Scope**|**Why It Applies**|
| :- | :- | :- |
|IEC 62304|Medical device software lifecycle|Class C software — the core lifecycle standard|
|ISO 13485|Quality management system|Required QMS for medical device organisations|
|ISO 14971|Risk management for medical devices|Mandatory risk process|
|IEC 62366-1|Usability engineering|Safe clinician interaction design|
|FDA 21 CFR Part 11|Electronic records & signatures|Audit trail + clinician e-signature|
|FDA SaMD guidance|Software as a Medical Device|Classifies the CDS and its clearance path|
|HIPAA|PHI privacy & security (US)|Patient data protection|
|GDPR|Data protection (EU)|EU patient data protection|
|EU MDR 2017/745|Medical device regulation (EU)|CE marking pathway for EU deployment|

## **9.2 Required Document Set**

|**Document**|**Purpose**|**Standard**|
| :- | :- | :- |
|Software Requirements Specification|Defines every functional + safety requirement|IEC 62304|
|Software Architecture Document|The deterministic-first design of record|IEC 62304|
|Software Detailed Design|Engine-level design specifications|IEC 62304|
|Hazard Analysis|Identifies clinical hazards from software failure|ISO 14971|
|Risk Management File|All hazards, controls, residual risk|ISO 14971|
|FMEA|Failure modes and effects analysis|ISO 14971|
|Verification Plan & Report|Proves software meets requirements|IEC 62304|
|Validation Plan & Report|Proves software meets clinical intent|IEC 62304|
|Traceability Matrix|Requirement -> design -> code -> test|IEC 62304|
|Clinical Evaluation Report|Clinical evidence of safety + performance|MDR / FDA|
|Usability Engineering File|Safe-use evidence|IEC 62366-1|
|Configuration & Change Mgmt Plan|How versions + changes are controlled|IEC 62304|
|Design History File|Complete record of the design process|ISO 13485|

## **9.3 Clearance Strategy**
- Classify the device with regulatory counsel (likely Class II SaMD / FDA clearance pathway in the US; Class IIa/IIb under EU MDR).
- Engage a Notified Body (EU) and/or pre-submission (Q-Sub) meeting with FDA early.
- Pursue the narrow PGx indication first — a tighter indication is a faster, more defensible submission.
- Build the Design History File continuously from day one, not retrospectively.


# **10. Step-by-Step Implementation Phases**


*The build is organised into seven phases. Each phase has concrete deliverables and explicit exit criteria. A phase is not 'done' until its exit criteria are met and signed off.*

## **Phase 0 — Foundations & Quality System (Months 0–3)**
**Objectives**

- Stand up the quality management system (ISO 13485) and document control.
- Establish the regulatory strategy and software safety classification.
- Set up the engineering environment with traceability from day one.

**Steps**

1. Adopt an eQMS; define SOPs for design control, change control, and CAPA.
1. Write the initial Software Requirements Specification (SRS) for the PGx indication.
1. Classify the software (IEC 62304 Class C) and the device (with counsel).
1. Stand up the traceability toolchain (requirements <-> tests <-> code).
1. Define the risk management plan and open the Risk Management File.

**Exit Criteria**

- eQMS live; SRS v1 approved; classification documented; traceability operational.

## **Phase 1 — Deterministic Decision Core (Months 3–8)**
**Objectives**

- Build and validate the phenotype engine and CPIC rule engine for CYP2D6/CYP2C19.

**Steps**

1. Build the genotype normaliser (star-allele standardisation).
1. Build the deterministic phenotype engine with the versioned activity-score table.
1. Build the CPIC rule engine with the versioned guideline registry.
1. Create the golden phenotype dataset and achieve 100% deterministic pass.
1. Implement rule authoring + signing + version control with change governance.
1. Pass Gate 1 (technical validation) for the decision core.

**Exit Criteria**

- Phenotype determinism proven by property tests; rule engine exact-match verified; Gate 1 passed.

## **Phase 2 — Evidence & Safety Engines (Months 6–12)**
**Objectives**

- Build the evidence engine and the four safety engines; integrate the arbitrator.

**Steps**

1. Build the citation-grounded evidence engine with version pinning + no-citation block.
1. Build the contraindication, drug-interaction, allergy, and missing-data engines.
1. Build the safety arbitrator implementing the authority hierarchy.
1. Implement the consistency guard between explanation and verdict.
1. Wire the full pipeline (stages 1–18) with audit events at every step.
1. Pass Gate 1 for evidence + safety engines and the integrated pipeline.

**Exit Criteria**

- Every safety engine blocks its hazard test cases; arbitration verified; pipeline integration tests green.

## **Phase 3 — Interoperability & Clinician UI (Months 9–15)**
**Objectives**

- Connect to the EHR via SMART on FHIR + CDS Hooks; build the review UI.

**Steps**

1. Build the FHIR R4 gateway and PatientSnapshot normaliser.
1. Register as a CDS Hooks service for order-sign / order-select.
1. Build the clinician review UI (accept / modify / reject + structured override).
1. Implement 21 CFR Part 11 electronic signature on clinician sign-off.
1. Add HL7 v2 ingestion for legacy systems (as needed).
1. Conduct formative usability testing (IEC 62366-1).

**Exit Criteria**

- End-to-end demo in a FHIR sandbox EHR; clinician can review and sign; usability findings addressed.

## **Phase 4 — Clinical & Safety Validation (Months 15–22)**
**Objectives**

- Pass Gate 2 (clinical) and Gate 3 (safety) with documented evidence.

**Steps**

1. Assemble the clinical validation dataset (de-identified / expert-constructed).
1. Run the blinded expert concordance study; target >= 99% concordance.
1. Root-cause and resolve every discordance; update rules/data under change control.
1. Execute the hazard test set; confirm fail-closed and zero unsafe outputs.
1. Conduct summative usability validation.
1. Compile the Clinical Evaluation Report.

**Exit Criteria**

- Concordance threshold met; safety thresholds met; CER complete; Gates 2 and 3 signed off.

## **Phase 5 — Regulatory Submission & Pilot (Months 22–30)**
**Objectives**

- Complete the design dossier, submit for clearance, and run a controlled clinical pilot.

**Steps**

1. Complete the Design History File and the full document set (section 9.2).
1. Finalise the Risk Management File with verified controls and residual-risk acceptance.
1. Pass Gate 4 (regulatory validation) via independent QA review.
1. Submit (FDA pathway and/or EU MDR via Notified Body).
1. Run a controlled pilot at 1–2 partner hospitals under oversight.
1. Capture real-world performance and feed CAPA + post-market surveillance.

**Exit Criteria**

- Submission accepted; pilot running safely; post-market surveillance process live.

## **Phase 6 — Controlled Rollout & Expansion (Months 30+)**
**Objectives**

- Expand to more sites and, only then, additional validated gene-drug pairs.

**Steps**

1. Scale deployment to additional hospitals on the validated indication.
1. Operate post-market surveillance; monitor override rates and safety signals.
1. Add the next gene-drug pair through the SAME four validation gates.
1. Expand indications one validated step at a time — never broaden ahead of evidence.

**Exit Criteria**

- Stable multi-site operation; each new capability independently validated and cleared.

## **10.1 Phase Summary Timeline**

|**Phase**|**Focus**|**Months**|**Gate**|
| :- | :- | :- | :- |
|0|Foundations & QMS|0–3|—|
|1|Deterministic decision core|3–8|Gate 1|
|2|Evidence & safety engines|6–12|Gate 1|
|3|Interoperability & UI|9–15|—|
|4|Clinical & safety validation|15–22|Gates 2, 3|
|5|Regulatory submission & pilot|22–30|Gate 4|
|6|Controlled rollout & expansion|30+|Per capability|


# **11. Team & Governance**


## **11.1 Core Roles**

|**Role**|**Responsibility**|
| :- | :- |
|Clinical Lead (MD/PharmD)|Owns clinical correctness, validation, expert review|
|Pharmacogenomics SME|Defines phenotype/rule correctness; reviews discordances|
|Regulatory Affairs Lead|Owns submission strategy and the document set|
|Quality Lead|Owns the QMS, design control, CAPA, audits|
|Software Architect|Owns the deterministic-first architecture of record|
|Backend Engineers|Build engines, pipeline, arbitrator, audit|
|Interoperability Engineer|FHIR/HL7/SMART/CDS Hooks integration|
|Safety Engineer|Hazard analysis, fail-closed verification, hazard test set|
|Frontend Engineer|Clinician review UI and usability|
|Clinical Data Scientist|Validation dataset, concordance analysis|
|QA / Test Engineers|Test strategy, golden datasets, traceability|
|Privacy/Security Officer|HIPAA/GDPR, encryption, access control|

## **11.2 Governance Gates**
- A Change Control Board approves any change to rule tables, phenotype data, or safety logic.
- A Clinical Safety Officer must sign off before any release reaches patients.
- No phase advances without documented exit-criteria sign-off.
- Every external dependency is version-pinned and reviewed before adoption.


# **12. Testing & Quality Assurance**


|**Test Layer**|**What It Covers**|**Acceptance**|
| :- | :- | :- |
|Unit|Each function in each engine|Full branch coverage on safety paths|
|Property-based|Phenotype determinism, idempotence|Thousands of cases, zero variance|
|Golden dataset|Known diplotype -> known phenotype|100% pass, no exceptions|
|Integration|Full pipeline incl. failure modes|Every failure mode handled per spec|
|Safety / hazard|Curated unsafe scenarios|Zero unsafe output reaches clinician|
|Consistency|Explanation vs verdict mismatch|100% caught and regenerated|
|Interoperability|FHIR/HL7/CDS Hooks conformance|Passes conformance suites|
|Usability|Clinician task performance|Use-related risks mitigated|
|Regression|Re-run on every change|No previously-passing case regresses|
|Performance|Latency under load|Within defined p95 budget, fail-closed|

**Safety-critical code paths require 100% test pass with no waivers. A failing safety test blocks release — it is never deferred.**


# **13. Deployment & Operations**


## **13.1 Release Management**
- Every release is a controlled, versioned, signed artifact tied to a validated rule-set version.
- Releases pass full regression + safety suites and a release review before deployment.
- Rule-table updates (e.g. new CPIC version) follow change control and re-validation, not hot edits.

## **13.2 Monitoring**

|**Signal**|**Why It Matters**|
| :- | :- |
|Clinician override rate|Rising overrides may indicate a guidance problem|
|Block rate by safety engine|Detects mis-calibration or data issues|
|'Cannot advise' rate|Tracks data completeness in the field|
|Latency + availability|SLA + fail-closed verification|
|Discordance reports|Any field disagreement with clinicians|
|Audit completeness|Confirms no clinical output without a record|

## **13.3 Incident & Post-Market Surveillance**
- Defined severity levels with a patient-safety escalation path.
- Any potential patient-safety event triggers immediate review and, if needed, field action.
- Post-market surveillance feeds CAPA and the risk file continuously.
- Trend analysis on overrides and blocks informs rule refinement under change control.


# **14. Risk Management**


*Risk management is continuous and follows ISO 14971: identify hazards, analyse, control, verify, and monitor residual risk.*

## **14.1 Representative Hazard Analysis**

|**Hazard**|**Cause**|**Control**|
| :- | :- | :- |
|Incorrect phenotype|Novel/misread allele|Return indeterminate; never guess; expert route|
|Wrong recommendation|Stale guideline version|Versioned registry; rule pinned to citation|
|Unsafe drug given|Missed interaction/allergy|Independent safety engines; fail-closed block|
|Acting on bad data|Missing/invalid fields|Missing-data detector; 'cannot advise'|
|Misleading explanation|LLM hallucination|Consistency guard; discard + regenerate|
|Silent failure|Engine timeout/outage|Fail-closed; alert; no output without audit|
|Unattributed action|Weak access control|Attribution + e-signature + break-glass log|
|Tampered record|Audit manipulation|Append-only, hash-chained, signed export|
|Automation bias|Clinician over-trust|Show derivation + evidence; easy override; training|

## **14.2 Residual Risk Principle**
**Every identified hazard must have a control that is implemented, tested, and verified before release. Residual risk is formally assessed and accepted by the Clinical Safety Officer; unacceptable residual risk blocks release.**


# **Appendix A — Rule Schema Reference**


Phenotype activity-score table entry:

{ gene, allele, function, activity\_value, source, version, hash }

CPIC recommendation rule:

{ gene, drug, phenotype, recommendation, strength,

`  `cpic\_version, citation\_ids[], effective\_date, hash }

Safety rule (generic):

{ type (contra|ddi|allergy), trigger, severity,

`  `action (block|warn), rationale, citation\_ids[], version }

# **Appendix B — Traceability Matrix Template**


|**Req ID**|**Requirement**|**Design Ref**|**Code Module**|**Test ID**|**Status**|
| :- | :- | :- | :- | :- | :- |
|SR-001|Phenotype is deterministic|ARCH-4.1|phenotype\_engine|T-PH-001|Pass|
|SR-002|No-citation recommendation blocked|ARCH-4.3|evidence\_engine|T-EV-014|Pass|
|SR-003|Safety block overrides recommendation|ARCH-5.1|arbitrator|T-AR-007|Pass|
|SR-004|Missing data -> cannot advise|ARCH-7.4|missing\_data|T-MD-003|Pass|
|SR-005|Explanation matches verdict|ARCH-2.2|consistency\_guard|T-CG-002|Pass|

# **Appendix C — Glossary**


|**Term**|**Definition**|
| :- | :- |
|CDS|Clinical Decision Support — software that aids clinician decisions|
|SaMD|Software as a Medical Device|
|CPIC|Clinical Pharmacogenetics Implementation Consortium|
|Diplotype|The pair of star alleles a patient carries for a gene|
|Phenotype|Metabolizer status derived from genotype (UM/NM/IM/PM)|
|Deterministic|Same input always yields the same output; no randomness/model|
|Fail-closed|On uncertainty/failure, block the output rather than allow it|
|Arbitration|Reconciling all engine outputs into one final verdict|
|Authority hierarchy|Fixed order of which component can influence output|
|FHIR|Fast Healthcare Interoperability Resources (HL7 standard)|
|SMART on FHIR|Secure app-launch + auth framework over FHIR|
|CDS Hooks|Standard for triggering CDS from EHR workflow|
|Concordance|Agreement rate between the system and expert review|



© 2026 AMGI Research — Abi and Anu Research Initiative

ANUClaw v3 Hospital-Grade CDS — Full Implementation Plan

*Deterministic rules decide. Evidence grounds. The model explains. The clinician approves.*
Page  of 
