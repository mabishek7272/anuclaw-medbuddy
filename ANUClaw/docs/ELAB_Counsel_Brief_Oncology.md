# Counsel Brief — ANUClaw E-LAB (Oncology), Regulatory & Liability Kickoff

**Purpose:** brief outside regulatory/legal counsel to begin the work that gates clinical production (design gate **#9**). Hand this, plus `ELAB_Clinical_Engine_Platform_Design.md` (v2) and `ELAB_Gate_Specs_Oncology.md`, to counsel.
**Status:** software built + tested (220 tests); **no clinical use** until counsel + validation complete.

## 1. What the product is
A tiered, multi-tenant clinical-AI **API platform**. Partner med-techs call our engines and (for the clinical tier) receive **guarded decision-support verdicts**. E-LAB is our own reference UI on the same APIs. First clinical domain: **oncology combination-regimen decision support** for adult patients.

## 2. Two tiers — separately licensed (confirmed business decision)
| Tier | Scope | Licence | Claim |
|---|---|---|---|
| **Research (RUO)** | `ruo` | **Researcher licence** | Raw engine outputs (docking, etc.), **non-diagnostic**, de-identified input enforced |
| **Clinical** | `clinical` + active BAA + enabled domain | **Separate clinical licence** | Guarded, audited decision-support verdict; clinician-in-the-loop |

## 3. Intended use (for classification — confirm/refine)
> *ANUClaw Oncology Combination Decision Support* assists qualified oncology clinicians in evaluating candidate multi-drug systemic anti-cancer regimens for an individual adult patient — presenting guideline-grounded options, DDI/contraindication/allergy safety findings, and supporting evidence — **for the clinician's review and decision. It does not select, dose, or administer therapy autonomously.**

## 4. Safety controls already implemented (so counsel sees the posture)
- Deterministic rules make the decision; ML/engines are **evidence only** and can never originate a recommendation (enforced invariant + hazard test).
- Hard safety overrides (DDI / contraindication / allergy); fail-closed.
- Mandatory clinician e-signature (**21 CFR Part 11**); append-only, hash-chained, per-tenant audit.
- RUO **de-identification gate** (rejects identifiers + genomic payloads); per-tenant isolation; SMART/JWKS auth.

## 5. Questions for counsel (the #9 deliverables)
1. **FDA classification:** does this meet the device definition (i.e., **not** exempt CDS under the 2022 guidance, because it drives specific treatment selection and the ML/engine basis isn't independently re-derivable)? Pathway — **De Novo** vs 510(k) (predicate?); IMDRF SaMD category.
2. **EU MDR:** confirm **Rule 11** class (IIb vs III for life-threatening-condition decision software); Notified Body route.
3. **Clearance holder & partner model:** when a partner embeds the Clinical tier, does that create a *new device* / *significant modification*? Who holds which clearance? How is responsibility allocated (ANUClaw ↔ partner ↔ hospital)?
4. **RUO tier:** is non-diagnostic labelling + the enforced de-id gate sufficient to keep RUO outside device scope? Draft the **researcher-licence** prohibited-use / no-clinical-use terms.
5. **Privacy:** HIPAA **BAA** scope for the Clinical tier; GDPR controller/processor roles; data-residency obligations (we support residency pinning).
6. **Labelling & claims** review for both tiers; **liability/indemnity** structure and required disclaimers.

## 6. Lead-time note
Counsel engagement + a Q-Sub (FDA) / Notified Body pre-review have long lead times — start in parallel with SME content validation (see `ELAB_SME_Validation_Packet_Oncology.md`). Software is not the critical path; this is.
