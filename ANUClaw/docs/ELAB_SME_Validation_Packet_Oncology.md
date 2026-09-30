# SME Validation Packet — ANUClaw E-LAB (Oncology + reused PGx)

**Purpose:** brief the pharmacogenomics / oncology SME(s) to begin **clinical content validation** and the **concordance study** (design gates 2 & 3). Every item below ships today as **illustrative seed data — NOT validated** and must not be used clinically until signed off.
**Workflow:** SME validates each item against the cited guideline version → engineer updates the data file → **re-seal** (`npm run cds:seal`) → record sign-off in the validation report.

## 1. Content inventory to validate (file → items → check)

| File | Items | What the SME must validate |
|---|---|---|
| `src/cds/clinical/oncology/data.ts` → `regimenRules` | each `(tumor_type, stage, biomarker, line) → regimen` | Is the regimen guideline-indicated for that exact context? Correct **strength**, correct **NCCN/ESMO citation + version**. This table is the **only thing allowed to recommend** — accuracy is paramount. |
| `…/oncology/data.ts` → `guidelineCitations` | each citation | Real, resolvable guideline **section** + PMID; matches the rule it backs. |
| `…/oncology/data.ts` → `organRules` | e.g. trastuzumab `lvef ≥ 50` | Correct organ-function thresholds + contraindication rationale + citation. |
| `src/cds/data/cyp2d6.ts`, `cyp2c19.ts` | allele activity values, phenotype bands | Match current **CPIC** allele-functionality + activity-score consensus. |
| `src/cds/data/cpic-rules.ts` | gene-drug-phenotype recommendations | Match cited **CPIC guideline version**; correct strength + citations. |
| `src/cds/evidence/data/citations.ts` | PGx citations | Real PMIDs / guideline sections; version-pinned. |
| `src/cds/safety/data/contraindications.ts`, `drug-interactions.ts`, `allergy-rules.ts` | safety rules | Add **oncology-relevant** DDIs / contraindications / cross-sensitivities; validate severities + actions. |

## 2. Validation gates (design §8 / gate specs)
- **Gate 1 — Technical:** ✅ done (determinism, golden datasets, fail-closed — automated tests).
- **Gate 2 — Clinical concordance:** the study in §3 below.
- **Gate 3 — Safety/hazard:** confirm the hazard set (e.g. low-LVEF + trastuzumab, contraindicated DDI, missing biomarker) all **block / cannot-advise**, never recommend.
- **Gate 4 — Regulatory:** traceability (requirement → rule → test), risk file (ISO 14971), signed evidence.

## 3. Concordance study protocol (skeleton — SME to finalize)
- **Objective:** agreement of the system's verdict with an independent expert oncology panel, blinded.
- **Ground truth:** ≥2 independent oncologists/clinical pharmacologists per case; disagreements adjudicated by a third.
- **Dataset:** real de-identified or expertly-constructed oncology combination cases, **stratified** by tumour type / biomarker / line, with a deliberate **adversarial edge-case** subset (contraindications, missing data, no-guideline triples, high-synergy-but-not-indicated).
- **Primary metric:** **sensitivity for catching unsafe outputs** (the system must never *recommend* something the panel deems unsafe) — reported with a confidence interval — alongside overall agreement. Pre-register the sample size and acceptance threshold (design target ≥99% concordance with **zero** unresolved safety discordances).
- **Procedure:** run the system on each case (clinician-review mode); compare verdict to panel; **root-cause every discordance** (data / rule / expert) and resolve under change control before release.
- **Output:** signed Clinical Evaluation Report + updated, re-sealed data + manifest; this unlocks the Clinical tier for **oncology only** (other domains repeat the gates).

## 4. Hard rule
No clinical-tier go-live for a domain until its content is SME-signed, the concordance + hazard gates pass, and the data is re-sealed. RUO (researcher) tier may proceed in parallel (non-diagnostic, de-identified).
