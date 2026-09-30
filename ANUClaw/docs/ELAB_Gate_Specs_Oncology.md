# E‑LAB Pre‑Phase‑0 Gate Specs — First Clinical Domain: Oncology Combination Therapy

Companion to `ELAB_Clinical_Engine_Platform_Design.md` (v2). Closes the **Part B.5** hard blockers for the first validated Clinical domain. Still **pre‑implementation** — these are specs/decisions, not code.

Covered here: **#1 Intended use**, **#2 Generalized decision/evidence model + first Clinical Decision Module + Origination Invariant**, **#5 Net‑new multi‑tenancy** (incl. #7 auth hardening, #8 GDPR). Remaining‑item status in §4.

---

## Spec 1 — Intended Use & Regulatory Classification (B.5 #1)

**Intended use statement (v1, draft for regulatory/clinical sign‑off):**
> *ANUClaw Oncology Combination Decision Support* is software intended to **assist qualified oncology clinicians** in evaluating candidate multi‑drug systemic anti‑cancer regimens for an individual adult patient, by presenting **guideline‑grounded regimen options**, **drug–drug interaction / contraindication / allergy safety findings**, and **supporting molecular/pharmacologic evidence**, **for the clinician's review and decision**. It does **not** select, dose, or administer therapy autonomously.

- **Indications for use (v1, deliberately narrow):** adult patients being considered for systemic **combination** anti‑cancer therapy within **one defined tumor type** (chosen with clinical leads) and standard lines of therapy. Expansion (tumor types, lines) follows the per‑domain validation gates.
- **Intended users:** board‑certified/eligible **medical oncologists** and **oncology clinical pharmacists**.
- **Use environment:** hospital/clinic at the point of **regimen planning** (tumour board / prescribing).
- **Decision‑support role:** **informs**; the clinician decides; **mandatory e‑signature** before any action.
- **Explicitly NOT:** diagnosis; autonomous selection; **MD‑simulation‑derived dosing** (MD is RUO/visualization only in v1, per D13); pediatrics; emergency use.

**Regulatory classification (to confirm with counsel/Notified Body — drives the whole QMS):**
- **FDA CDS status:** drives **specific treatment selection** and the clinician **cannot independently re‑derive** the ML‑synergy/engine basis → **does NOT meet the non‑device CDS exemption** (21st Century Cures / 2022 CDS guidance) → **regulated device (SaMD)**. Pathway: **De Novo** (likely; novel) or 510(k) if a predicate exists; pre‑submission (Q‑Sub) early.
- **IMDRF SaMD:** informs *treatment* of a *serious/critical* condition (cancer) → high category (III–IV).
- **IEC 62304:** **Class C** (a defect could contribute to death/serious injury).
- **EU MDR:** **Rule 11** → likely **Class IIb or III** (decision software for therapeutic purposes in a life‑threatening condition) → CE via **Notified Body**.
- **Also:** ISO 14971 risk file, ISO 13485 QMS, IEC 62366‑1 usability, 21 CFR Part 11 (already in core), HIPAA/GDPR.

**Top domain hazards (feed the ISO 14971 file):** wrong/inapplicable regimen recommended; missed DDI (incl. supportive‑care meds, CYP/UGT interactions); missed contraindication (cardiac/renal/hepatic, e.g. anthracycline cardiotoxicity, trastuzumab + low LVEF); **automation bias / over‑trust in synergy ML**; stale guideline version; dosing error (mitigated by deferring dosing to validated protocols, not MD). Each maps to a control already in the gateway (safety block, evidence pinning, fail‑closed, sign‑off, origination invariant).

---

## Spec 2 — Generalized Decision/Evidence Model + Oncology Clinical Decision Module (B.5 #2)

This closes **C1** (gateway must handle a non‑PGx result) and **C2** (engines must not originate decisions).

### 2.1 Generalize the CDS core (mechanism reused, content pluggable)

Today the decision core is PGx‑hardwired: `lookupRecommendation(gene, drug, phenotype) → CpicRule` + CPIC‑only citation grounding. Generalize to a **per‑domain `ClinicalDecisionModule`** plugged into the **unchanged** arbitrator + audit + sign‑off:

```
interface ClinicalDecisionModule {
  domain                      // 'oncology-combination'
  version                     // sealed, validated, integrity-pinned
  originate(query, context):  // DETERMINISTIC rules only → candidates
      CandidateRecommendation[]            // may be empty → no_guideline
  requiredContext(query):     // for the missing-data engine
      string[]
}
CandidateRecommendation {
  recommendation, strength, citation_ids[],   // from a domain EVIDENCE STORE
  originated_by: 'deterministic_rule'         // provenance of origination
}
```

- **Evidence store generalized** beyond CPIC to a domain store (oncology: **NCCN/ESMO** guideline sections + pivotal‑trial PMIDs), keeping the **no‑citation block** and **version pinning**. `groundEvidence()` becomes domain‑parameterized rather than CPIC‑only.
- **Arbitrator / audit / sign‑off unchanged.** Verdict shape unchanged.

### 2.2 The Origination Invariant (closes C2 — testable)

> **INV‑ORIG:** A verdict may carry `decision = 'recommend'` **only if** its `CandidateRecommendation.originated_by == 'deterministic_rule'`. Engine/ML/simulation outputs are attached **only** as `supporting_evidence` and may **(a)** raise a WARNING, **(b)** **rank** already‑originated candidates, or **(c)** contribute to a **BLOCK** — they may **never originate** a candidate nor upgrade a non‑recommended option to recommended.

**Enforced** in the arbitrator (assert origin before emitting `recommend`) **and** hazard‑tested: *high synergy score + no deterministic guideline indication → verdict must be `no_guideline`/`cannot_advise`, never `recommend`.*

### 2.3 Oncology Combination Clinical Decision Module (first module)

- **`ClinicalQuery`:** `{ tumor_type, stage, biomarkers[], candidate_regimen: drug[], line_of_therapy }`.
- **`ClinicalContext`** (PatientSnapshot extended): organ function (cardiac/LVEF, renal, hepatic), comorbidities, current meds (incl. supportive care), allergies, performance status, prior therapies.
- **Originator = sealed regimen‑indication rule table** derived from guidelines: `(tumor_type, stage, biomarker, line) → indicated regimen(s)` with strength + `citation_ids`. **Criteria‑match only, no inference** (same discipline as the CPIC table). This is the *only* thing that can originate a recommendation.
- **Safety (reused + extended):** **DDI** engine over *all regimen pairs + supportive‑care meds* (combinations are its native domain); **contraindication** (organ‑function thresholds, cardiotoxicity); **allergy**; **missing‑data** (require organ function + biomarkers, else `cannot_advise`).
- **Engine evidence (supporting only, RUO‑grade, labeled):** synergy (DeepChem/PyTDC) score+confidence, docking poses, structure — attached for **ranking/annotation**, gated by INV‑ORIG.

**Flow:** `query + context → originate() candidates (guideline rules) → ground evidence (guideline citations; block if none) → safety engines (DDI/contra/allergy/missing) → arbitrate → verdict; attach engine evidence as supporting → clinician sign‑off.`

**Worked example:** HER2+ breast cancer, stage II, candidate `[trastuzumab + pertuzumab + docetaxel]` → guideline rule **originates** the regimen (NCCN citation) → contraindication engine checks **LVEF**: if low → **BLOCK** (cardiotoxicity) regardless of any synergy score; else → **recommend**, with synergy/structure attached as *supporting evidence, not basis of decision* → clinician signs. A regimen with high model‑predicted synergy but **no** guideline indication → **`no_guideline`** (INV‑ORIG holds).

This proves the gateway works for a non‑PGx domain (C1) and that engines inform but never decide (C2).

---

## Spec 3 — Net‑New Multi‑Tenancy, Auth & Privacy (B.5 #5, #7, #8)

Corrects the "(existing)" mislabel (C3) and the cache leak (C4).

### 3.1 Tenant model & binding
- **Add to tenant:** `scopes[]` (`ruo`,`clinical`), `baa_status` (`none|active|expired`), `residency` (`us|eu|…`), `allowed_clinical_domains[]`.
- **Token binding:** every token carries a `tenant_id` (org claim); middleware resolves + binds `req.tenant`; **enforced at every data / cache / artifact / audit boundary** — scope answers *what action*, tenant_id answers *whose data*.

### 3.2 Clinical gate (fail‑closed, all required)
`/v1/clinical/*` requires: `scope=clinical` **AND** server‑side `baa_status==active` (DB‑backed, **not** a token claim) **AND** `domain ∈ allowed_clinical_domains` **AND** residency match. Any miss → 403, no compute.

### 3.3 Cache partition (closes C4)
Cache key = `(tenant_id, tier, engine_id, engine_version, input_hash, refdb_hashes)`. Cross‑tenant sharing **only** when `tier=ruo` **and** the input is on a **public allow‑list** (public structures / library SMILES). **Clinical artifacts are never shared** → no cross‑tenant PHI read, no timing oracle.

### 3.4 Per‑tenant audit chain (closes C3)
Audit becomes **per‑tenant**: composite key `(tenant_id, seq)`, per‑tenant `head()` / `verifyChain()` / `export()`; Postgres `PRIMARY KEY (tenant_id, seq)`, the no‑mutate trigger unchanged. *(This is a change to the reused `src/cds/audit` — flagged to the CDS owners.)*

### 3.5 Auth hardening (B.5 #7)
JWKS‑by‑URL + `kid` selection + per‑tenant trusted‑issuer map; **RS256/ES256 only in prod**; **HS256 forbidden when `tier=clinical`**; **Clinical auth cannot be disabled** — config validation fails closed if no key (the current "silently disabled → open PHI endpoint" behavior is prohibited for Clinical).

### 3.6 Privacy / GDPR (B.5 #8)
**Crypto‑shredding:** per‑data‑subject encryption key; PHI + artifacts encrypted under it; **erasure = destroy the key** (renders retained ciphertext/artifacts unrecoverable while the append‑only hash chain stays intact). **Audit payloads store only hashes / pseudonymous `subject_ref`s — never raw PHI.** PHI scrubbed from job `error`, logs, SSE, and webhook payloads; webhooks signed + tenant‑pinned. Residency pins PHI + artifacts + audit to the tenant's region.

---

## Spec 4 — Engine provenance binding & reproducibility tiering (B.5 #4)

Closes the over‑claimed "exactly reproducible" and the unbound‑provenance gap.

- **Supporting‑evidence provenance.** Each attached engine result carries:
  ```
  SupportingEvidence {
    engine_id, engine_version, input_hash, seed?, artifact_hashes[],
    confidence?, reproducibility_class
  }
  reproducibility_class = 'deterministic'              // CDS core, RDKit, PK/PD ODE
                        | 'seed_reproducible_pinned_hw' // MD (seed + pinned image/driver)
                        | 'snapshot_only_external'      // AlphaFold API (cannot pin a remote model)
  ```
- **Bind into the verdict hash.** This provenance is folded into the **`verdict_hash`** content (today it carries none) so two different engine runs cannot collide to the same hash.
- **Audit re‑verification semantics.** Defined as **"recompute the verdict from the *stored* engine outputs + sealed rules/data,"** *not* "re‑run the engine." Output **bytes + content hash** are kept in the artifact store; audit references `artifact_hashes`.
- **The clean, defensible position (thanks to INV‑ORIG):** because engines are **supporting‑only** and the **decision is originated by deterministic rules**, the **clinical decision is always deterministically reproducible**. Only *attached supporting evidence* may be `snapshot_only` (e.g. an AlphaFold structure) — and such a verdict is **flagged** as carrying snapshot evidence. Reproducibility of *the decision* never depends on a non‑deterministic engine.

---

## Spec 5 — RUO de‑identification input gate (B.5 #6)

Makes "de‑identified" an **enforced gate**, not a label, and tightens RUO→Clinical drift.

- **Mandatory validator on `/v1/ruo/*`** rejects inputs carrying **direct identifiers** (name, MRN, DOB, full dates, geo, contact) and **high‑re‑identification‑risk genomic payloads**.
- **Policy:** germline/large variant sets, whole genomes, and any patient‑linked data are **personal data/PHI** → **not permitted on RUO**; the caller is directed to the **Clinical tier (BAA)**. RUO accepts: public reference structures, library ligands/SMILES, single targets without patient linkage, de‑identified/synthetic inputs.
- **Mechanism:** schema‑level rejection of identifier fields + threshold/heuristic checks for genomic re‑id risk (e.g. variant count over N, germline markers) → **reject with guidance** to use Clinical. Every RUO response stamped non‑diagnostic; RUO inputs logged (de‑identified) per tenant.

---

## §4 — Remaining Part B.5 items: status

| Gate item | Status |
|---|---|
| #1 Intended use → class/route | ✅ Spec 1 (pending counsel confirm of pathway) |
| #2 Generalized decision/evidence module + Origination Invariant | ✅ Spec 2 |
| #3 MD descoped from Clinical v1 | ✅ Decided (D13); analytical‑validation standard deferred to MD→Clinical promotion |
| #4 Bind engine provenance into evidence + `verdict_hash`; tier reproducibility claims | ✅ Spec 4 |
| #5 Net‑new multi‑tenancy (tenant binding, per‑tenant audit, cache partition, BAA gate, residency) | ✅ Spec 3 |
| #6 RUO de‑identification input gate (genomic = PHI) | ✅ Spec 5 |
| #7 Clinical auth hardening | ✅ Spec 3.5 |
| #8 GDPR crypto‑shredding + no‑raw‑PHI‑in‑audit | ✅ Spec 3.6 |
| #9 Counsel‑reviewed liability model | 🔲 External (legal counsel) — cannot be closed in‑repo |

**In‑repo gate is now complete (items #1–#8 specified; #3 decided).** The only remaining open blocker is **#9 — counsel‑reviewed regulatory liability model**, which must be done outside the repo with legal counsel. Once #9 is resolved, a **Phase‑0 implementation plan** can be drafted against these specs.
