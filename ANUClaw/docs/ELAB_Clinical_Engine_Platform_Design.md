# ANUClaw — E‑LAB Clinical Engine Platform · Design v1

**Status:** Design v2 (pre‑implementation) · brainstorming + **multi‑agent review completed**
**Risk class:** High‑impact / high‑risk SaMD
**Review outcome:** Enforcement skeleton validated; **headline reuse / reproducibility / multi‑tenancy claims corrected**. See **Part B — Multi‑Agent Review (findings, resolutions, pre‑Phase‑0 gate)** at the end; it supersedes any conflicting statement in Part A.
**Author trail:** AMGI Research · facilitated design

---

## 1. Understanding Summary

- **What:** Re‑architect E‑LAB from a per‑skill "prompt → text stream" runner into three real, interactive clinical workspaces — **Drug‑Combination Lab**, **Multi‑scale Simulation Lab** (molecular dynamics → patient PK/PD), and an **AR/XR Molecular** view — each a thin client over **tiered, multi‑tenant APIs** that expose ANUClaw's real scientific engines.
- **Why:** Prove platform value *and* let partner med‑tech startups embed hospital‑grade clinical AI in their own products. E‑LAB is the **reference consumer** (shop window) of the very APIs partners buy.
- **Who:** (a) hospital clinicians via E‑LAB; (b) partner developers via API — **RUO** and **Clinical** tiers.
- **Guarantee model:** Clinical‑tier calls return a **guarded verdict** (recommendation + deterministic safety blocks + evidence + confidence + signed audit) by routing engine outputs through the existing `src/cds` core. RUO‑tier returns **raw** engine outputs, labeled non‑diagnostic.
- **Reuse, don't reinvent:** `src/cds` (safety arbitration, evidence grounding, hash‑chained audit, 21 CFR Part 11 sign‑off) + `src/api` (tenants, API keys, scopes, metering, quotas, webhooks) + skill containers (AutoDock Vina, RDKit/OpenBabel, AlphaFold API, DeepChem/PyTDC).
- **Constraints:** correctness/validation over speed; real engines (no mocks); reproducibility (pinned engine versions, recorded seeds, audited I/O); heavy engines run async; fail‑closed everywhere.
- **Non‑goals:** not autonomous; not a clinician replacement; not a general chatbot; not "all domains clinically validated at once."

---

## 2. Assumptions

1. Heavy/MD compute runs as **async jobs** (queued, cached, version‑pinned); never blocks the UI/API response.
2. PHI in scope → **HIPAA + GDPR**; per‑tenant isolation; Clinical tier requires clinician auth + sign‑off and a **BAA**; RUO tier is non‑diagnostic and de‑identified.
3. **AR/XR is a user‑selectable view option** for verdicts (cards ↔ 3D/AR/XR) — it renders molecular evidence; it is **not** an independent decision‑maker.
4. **All major clinical domains** (cardiology, neurology, endocrinology/diabetes, immunology, oncology, infectious disease, psychiatry, …) are supported by the **architecture + RUO tier immediately**; the **Clinical tier is validated and enabled per domain, phased**.
5. Delivered first as this **design + phased architecture spec**; implementation is a large, regulated, multi‑phase program.

---

## 3. Decision Log

| # | Decision | Alternatives considered | Why |
|---|---|---|---|
| D1 | Real engines (no mocks) | Showcase / hybrid | A real hospital‑grade product, not a demo mock |
| D2 | All three modules, equal depth | Single flagship | Full product vision |
| D3 | Simulation = multi‑scale (MD → PK/PD) | PK/PD only; MD only; cohort sim | Most complete scientific narrative |
| D4 | All modules = clinician‑in‑the‑loop decision support | Mixed; RUO‑only; autonomous | Patient‑facing, hospital‑grade |
| D5 | Dual purpose: proof‑of‑value showcase **+** partner API platform | Showcase only | E‑LAB is the shop window for the API |
| D6 | **Tiered API:** RUO (raw) + Clinical (guarded verdicts) | Guarded‑only; raw‑only | Serve partners at varied maturity; Clinical tier = the hospital‑grade differentiator |
| D7 | **API‑first:** guarantees in the service layer; E‑LAB is the reference consumer | UI‑coupled logic | Every partner inherits hospital‑grade, not just the UI |
| D8 | AR/XR is a **selectable view option**, not a decider | AR/XR as decision support | Reconciles "user's choice" with deterministic decision authority |
| D9 | All domains in architecture + RUO; **Clinical validated per domain, phased** | All domains clinical at once | Breadth now, hospital‑grade honestly earned per domain |
| D10 | **Full compliance scope** (FDA SaMD / 21 CFR 11, HIPAA, GDPR, IEC 62304/62366, ISO 13485/14971, EU MDR), enforced **per tier** and **per domain** | Minimal/RUO‑only compliance | Hospital‑grade, partner‑distributable |
| D‑arch | **Architecture = Approach A (Guarded Engine Gateway)** | B: skill‑native (agent‑driven, non‑deterministic); C: engine microservices (premature, ops‑heavy) | Enforces guarantees once, keeps engines deterministic, reuses CDS+API+containers, clean path to C at scale |

---

## 4. Architecture — Guarded Engine Gateway (Approach A)

### 4.1 Layered stack

```
CONSUMERS      E-LAB reference UI (3 modules)   │   Partner apps
                        └──────────── same APIs ───────────┘
API TIER       src/api · /v1/ruo/* (raw) · /v1/clinical/* (guarded)
(existing)     multi-tenant keys · scopes · metering · quotas · rate-limit
CAPABILITY     handlers: drug-combination · simulation · structure
HANDLERS       (compose engines into a result)
GUARANTEE      ── Clinical tier only ──
GATEWAY        src/cds: safety arbitration → evidence → audit → sign-off
(existing)     ⇒ GUARDED VERDICT   (RUO bypasses → raw artifacts)
ENGINE LAYER   src/engines/* typed, version-pinned adapters over:
(new)          Vina · RDKit/OpenBabel · AlphaFold · DeepChem/PyTDC · PK-PD · MD
JOB RUNTIME    sync (light) | async queue (heavy) → versioned artifacts + provenance
(new)
```

**Invariants:** (1) a Clinical response can only be produced via the gateway — no path emits a clinical verdict without safety + evidence + audit; (2) RUO and Clinical share the **engine composition**, but Clinical adds substantial Clinical-only code (clinical-context assembly, the per-domain decision module) — *not* "the same handler"; (3) new code spans `src/engines/`, a job runtime, **net-new multi-tenancy** (scopes/BAA/quotas/per-tenant audit — these do *not* exist in `src/api` today), and **per-domain Clinical Decision Modules** (the CDS core's PGx decision/evidence path must be generalized). *[Corrected in Part B — original (2)/(3) were overstated.]*

### 4.2 Compliance & Quality spine (cross‑cutting)

- **Clinical tier (SaMD):** FDA SaMD + 21 CFR Part 11 · IEC 62304 (Class C) · ISO 14971 (risk) · ISO 13485 (QMS) · IEC 62366 (usability) · EU MDR (CE).
- **Data:** HIPAA · GDPR · residency pinning · per‑tenant BAAs · AES‑256 at rest · TLS 1.3 in transit.
- **RUO tier:** non‑diagnostic labeling · de‑identified · no clinical claims.
- **Already satisfied by the CDS core (reused):** hash‑chained immutable audit, 21 CFR Part 11 e‑signature, evidence grounding, fail‑closed, version‑pinned + sealed data, deterministic decisions, RBAC.
- **Added for the platform/API surface:** per‑tenant isolation + BAA gating, residency pinning, de‑identification on RUO, **hard tier labeling on every response**, **engine validation dossier** (each engine *version* validated + ISO 14971 risk‑assessed + traceable; unvalidated version cannot serve Clinical — fail‑closed), per‑domain validation gates.
- **Tiered‑model regulatory line:** ANUClaw holds the SaMD clearance for the Clinical‑tier intended use; partners operate under a BAA and remain responsible for *their* product's own intended‑use determination; RUO's explicit non‑diagnostic labeling prevents clinical drift.

### 4.3 Engine‑adapter contract (the linchpin)

```
EngineAdapter<In, Out> {
  id            // 'docking'|'pkpd'|'md'|'synergy'|'structure'|'chem'
  version       // pinned: tool ver + params + reference-data ver + image digest
  validated     // is THIS version in the clinical validation registry?
  run(input: In): EngineResult<Out>
}
EngineResult<Out> {
  engine_id, engine_version,
  input_hash,    // canonical hash of typed input (reproducibility)
  output: Out,   // STRUCTURED — never free text
  confidence?,   // probabilistic engines (ML)
  seed?,         // stochastic engines (MD) → exactly re-runnable
  provenance,    // tool ver, params, container digest, ref-DB versions
  artifacts[],   // poses/trajectories with hashes
  started_at, finished_at
}
```

Rules: **structured I/O only** (no LLM/agent in the path — deterministic tool invocation, the deliberate break from today's `runAgent`); **determinism/reproducibility** (same input+version ⇒ same output; MD records its seed); **version pinning + validation gating** (Clinical requires a validated engine version, fail‑closed; same sealing/manifest pattern as CDS data tables); **ML engines are evidence, not deciders** (synergy emits score+confidence+model version, never a recommendation — the gateway can override it).

### 4.4 Async job runtime

- **Sync** (light: PK/PD ODE, RDKit descriptors, cache hits) vs **async job** (heavy: MD, docking, cold AlphaFold).
- Lifecycle: `queued → running → succeeded | failed | timed_out | cancelled`; `Job{ id, tenant_id, engine_id, engine_version, input_hash, status, progress, artifact_refs[], error?, timestamps }`.
- Async API: `POST` → **202 + job_id + poll URL**; completion via **E‑LAB SSE**, partner **poll**, or **webhook** (existing per‑tenant `webhook_url`).
- **Content‑addressed cache** keyed by `(engine_id, engine_version, input_hash)` → reproducibility + cost control + snappy demos.
- Artifacts hash‑addressed with retention, referenced from job + audit.
- Concurrency: per‑tenant limits on the existing quota system; CPU pool now, **GPU pool later** (clean seam to Approach C).
- **Fail‑closed:** max runtime per job; on timeout/crash → Clinical emits *"cannot advise — engine unavailable."*
- **Reproducibility payoff:** cache+seed+version recorded ⇒ a verdict that used an MD run is re‑derivable exactly from the audit log.

### 4.5 Guarantee gateway (Clinical tier)

```
1. Handler runs engines → structured EngineResults
2. Handler assembles clinical context (PatientSnapshot). Missing → cannot_advise.
3. → CDS CORE (reused):
     decision core   deterministic rules map question + engine evidence → candidate rec
     safety engines  contraindication · DRUG-INTERACTION · allergy · missing-data → BLOCK
     evidence        attach citations (CPIC/guideline/PMID) · no-citation block
     arbitrator      reconcile → ONE verdict; SAFETY ALWAYS WINS
     guard           optional narrative + consistency guard
     audit           hash-chained; verdict_hash; engine versions+seeds recorded
     sign-off        clinician e-signature (21 CFR Part 11) before action
4. → GUARDED VERDICT (engine outputs attached as confidence-tagged evidence)
```

Crucial move: engine outputs (incl. ML synergy) enter the arbitrator as **evidence**, never as the decision — a high synergy score can still be **blocked** by a contraindication or DDI. ⚠ **Corrected in Part B:** this is *not* a "small adapter," and the CDS core is *not* "reused unchanged." The CDS arbitration/audit **mechanism** is reused, but its **decision core and evidence grounding are PGx-specific** (phenotype → `CpicRule`, CPIC-citation gating) and must be **generalized**; each Clinical domain ships a validated **Clinical Decision Module** (deterministic rules + evidence/citation set + safety tables) — the real, substantial work. The **origination invariant** (D12) governs it: a `recommend` verdict must be originated by a deterministic, non-ML/non-engine rule; engines/ML may only **block, annotate, or rank** — never originate. RUO skips the gateway entirely.

### 4.6 Tiered API + multi‑tenancy

```
/v1/ruo/*        raw · non-diagnostic · scope: ruo · de-identified · looser quotas
  POST /v1/ruo/dock | simulate | synergy | structure | cheminformatics
/v1/clinical/*   guarded verdicts · scope: clinical + BAA + clinician sign-off · PHI under BAA
  POST /v1/clinical/drug-combination → Verdict
  POST /v1/clinical/simulation       → Verdict
  GET  /v1/clinical/audit/:id/export → signed bundle
/v1/jobs/:id     async status (poll) + SSE / webhook completion
```

Tier enforcement = API‑key `scope` (`ruo` vs `clinical`) × SMART scope guard; the `clinical` scope unlocks the gateway path; no‑BAA tenants cannot reach `/v1/clinical/*` (fail‑closed). Per‑tenant data partition, **audit segregation**, residency pinning. Existing `usage-meter` enables tier pricing (RUO compute‑metered, Clinical per‑verdict). Every response carries `tier` + `regulatory` label + engine versions; Clinical adds `audit_id` + `verdict_hash`. **E‑LAB does no clinical logic** — it renders what the API returns, proving the API to partners.

### 4.7 The three modules

- **① Drug‑Combination Lab:** chem (RDKit) → structure (AlphaFold) → docking (Vina/compound) → **synergy** (DeepChem/PyTDC); gateway adds DDI/contraindication/allergy + PGx rules + evidence → Verdict. Views: synergy heat‑matrix, docking, 3D pose (opt. AR/XR), blocks, citations.
- **② Multi‑scale Simulation Lab:** **MD** (async, seeded) → derived params → **PK/PD ODE** (sync) over a virtual patient (genotype, renal/hepatic); gateway gates dosing support with PGx rules + safety → Verdict. Views: live conc/effect curves, MD animation, parameter sliders (re‑solve live), molecule in AR/XR.
- **③ AR/XR Molecular Lab (view option, D8):** reuses structure/docking artifacts; WebXR browser → phone AR → headset VR; visualizes the verdict's molecular evidence; zero clinical logic.

---

## 5. Testing & per‑domain validation gates

- **Engine adapters:** determinism (input+version → output hash), golden datasets/engine, schema validation, validation‑registry gating, MD seed‑reproducibility.
- **Job runtime:** lifecycle, cache‑hit correctness, timeout → fail‑closed, concurrency/quota.
- **Guarantee gateway:** CDS hazard‑style — safety BLOCK overrides engine evidence (e.g. high synergy + contraindication → block), no‑citation block, missing‑context → cannot‑advise, verdict‑hash reproducibility, audit‑chain integrity.
- **API/tenancy:** tier isolation (ruo key can't reach clinical), BAA/scope enforcement, metering, per‑tenant audit segregation, RUO labeling present.
- **Per‑domain clinical validation gates:** before `/v1/clinical/*` lights up for a domain, it passes the four CDS gates — **technical → clinical concordance (vs expert review) → safety/hazard → regulatory/traceability** — and each engine version clears its **ISO 14971 dossier**. RUO can ship ahead; Clinical is earned per domain.

---

## 6. Phased build order

```
P0  Engine-adapter contract + job runtime + RUO for ONE engine (docking)
    + reuse CDS/QMS compliance scaffolding            ← proves the spine
P1  Drug-Combination module, RUO end-to-end (engines+synergy+views+AR/XR)
P2  Clinical gateway for drug-combination in ONE domain (e.g. oncology):
    pass 4 gates → enable /v1/clinical/drug-combination there
P3  Multi-scale Simulation (RUO → Clinical), reusing CYP2D6/CYP2C19 PGx
P4  AR/XR hardening (phone AR + headset VR) as a cross-module view
P5  Partner API GA: docs, SDKs, BAA onboarding, tiered billing
    + expand domains one validated step at a time
```

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Scope (all domains + 3 modules + multi‑scale + SaMD) is very large | RUO‑first for breadth; Clinical validated per domain; flagship (drug‑combination) first |
| Heavy engines (MD) unreliable/slow live | Async jobs + content‑addressed cache + seed replay; fail‑closed |
| ML synergy is probabilistic in a hospital‑grade system | ML is evidence only; deterministic safety + clinician decide |
| Partner misuse of RUO for patient care | Hard non‑diagnostic labeling; tier isolation; BAA gating for Clinical |
| Per‑engine version drift breaks reproducibility | Pinned versions + validation registry + sealed manifests + audited I/O |
| Regulatory liability across partners | ANUClaw holds Clinical‑tier clearance; partners under BAA + own intended‑use determination |

---

## 8. Exit criteria & next step

**Brainstorming exit criteria — met:** Understanding Lock confirmed · Approach A accepted · assumptions documented · risks acknowledged · Decision Log complete · design validated section‑by‑section.

**Mandatory next step (do NOT skip):** because this is high‑impact, high‑risk SaMD, the finalized design + Decision Log must go through **multi‑agent design review** before any implementation begins. Only after that review should an implementation plan (starting at Phase 0) be created.

---

# Part B — Multi‑Agent Review (v2)

Three independent reviewers (clinical/regulatory, systems‑architecture, security/privacy) audited Part A **against the actual code** in `src/cds/*` and `src/api/*`. Verdict: the **enforcement skeleton is strong and partly built** (fail‑closed gateway, hash‑chained append‑only audit with a DB no‑mutate trigger, "safety‑wins" arbitration, version‑pinned validation gating, ML‑as‑evidence). But several **headline claims were overstated or contradicted by the code**. Part B supersedes Part A where they conflict.

## B.1 Critical findings & resolutions

**C1 — "Reuse CDS unchanged; small clinical adapter" is false (clinical + architecture).** The CDS decision core is PGx‑hardwired: decisions come only from `lookupRecommendation(gene, drug, phenotype) → CpicRule` (`rule-engine.ts`), and `groundEvidence()` blocks anything lacking CPIC citation IDs (`evidence-engine.ts`). A docking/MD/synergy result has no gene/`CpicRule`/CPIC citation → the gateway would deterministically return `cannot_advise` for every combination verdict.
→ **Resolution (D11):** generalize the CDS decision + evidence model; each Clinical domain ships a validated **Clinical Decision Module** (deterministic rules + evidence/citation set + safety tables). Reuse the *mechanism* (arbitrator, audit, sign‑off), not the PGx content.

**C2 — engines→decider boundary leaks (clinical).** The arbitrator only blocks/overrides; it never *originates* a recommendation. If a candidate is generated because an ML/engine score was high, ML is causally driving it.
→ **Resolution (D12 — Origination Invariant):** a `recommend` verdict must be originated by a deterministic, non‑ML/non‑engine rule; engines/ML may only **block, annotate, or rank** already‑justified options. Add hazard test: *high synergy + no deterministic indication → no recommendation.*

**C3 — multi‑tenancy & per‑tenant audit are net‑new, not "(existing)" (architecture + security).** `Tenant` has no scope/BAA/residency; `PLAN_LIMITS` are unlimited & unenforced; `usageMeter` counts calls not verdicts; the audit log is a **single global hash chain with no `tenant_id`** (`audit/postgres-sink.ts`) — `export()` returns all tenants.
→ **Resolution (D15):** treat as net‑new. Add `tenant_id` bound to the token and enforced at **every** data/cache/artifact/audit boundary; **per‑tenant audit chain** (composite `(tenant_id, seq)`, per‑tenant head/export); scope + **server‑side BAA gate** (DB‑backed, not a token claim); residency. Relabel §4.1/§4.6 "(existing)" → "(new)".

**C4 — shared content‑addressed cache leaks PHI across tenants (security).** Cache key `(engine_id, version, input_hash)` has no tenant; on the PHI Clinical tier, Tenant B's identical patient input gets a **cache hit on Tenant A's artifact** + a timing oracle.
→ **Resolution (D14a):** cache key = `(tenant_id, tier, engine_id, version, input_hash)` + all **reference‑DB content hashes**; cross‑tenant sharing only for RUO **and** only for allow‑listed public (non‑PHI) inputs; add concurrent‑job dedup; define negative/invalidation policy.

## B.2 High findings & resolutions

- **MD validity (clinical).** Single‑seed MD ≠ scientific validity (force‑field/water‑model swing dosing‑relevant ΔG by kcal/mol). → **D13:** **descope MD from Clinical dosing in v1** (MD = RUO/visualization only); Clinical dosing uses validated deterministic **PK/PD ODE** models. MD→Clinical later requires ensembles + uncertainty propagation + analytical‑validation acceptance criteria.
- **Reproducibility over‑claimed (architecture).** AlphaFold is an **external API** (can't truly pin); GPU‑MD isn't seed‑deterministic across hardware. → **D14b:** tier the claim — *deterministic* (CDS core, RDKit, PK/PD ODE) / *seed‑reproducible‑on‑pinned‑hardware* (MD) / *snapshot‑only* (external API). Store output **bytes + content hash**; audit re‑verification = *recompute verdict from stored outputs*, not *re‑run engine*. **Bind engine provenance** (`engine_id, engine_version, input_hash, seed, artifact_hashes`) into the `EvidenceObject` **and** the hashed `verdict_hash` content — today it carries none.
- **Intended use missing (clinical).** → **D19:** author intended use / indications / population / decision‑support role for the first Clinical domain → derive IEC 62304 class + FDA/MDR route. Gates Phase 0.
- **RUO "de‑identified" unenforced; genomic data is PHI (security/clinical).** → **D16:** mandatory RUO input gate; germline/variant payloads treated as personal data → routed to Clinical/BAA, never RUO. "De‑identified" becomes an enforced gate, not a label. Tightens RUO→Clinical drift control.
- **Auth weaknesses (security).** JWKS‑by‑URL not implemented; HS256 path; **auth silently disabled when no key is set** (open PHI endpoint). → **D17:** JWKS‑by‑URL + `kid` + per‑tenant issuer; **RS256/ES256‑only in prod**, HS256 forbidden for Clinical; Clinical auth **cannot be disabled** (fail‑closed at config validation, not a warning).
- **GDPR erasure vs append‑only audit (security).** → **D18:** crypto‑shredding (per‑subject keys; erasure = key destruction); audit payloads store **only hashes/pseudonymous refs, never raw PHI**.
- **Liability model legally optimistic (clinical).** A BAA is a privacy instrument, not a device‑liability/SaMD‑responsibility transfer. → **D20:** counsel‑reviewed regulatory responsibility model (when partner embedding constitutes a new device / significant modification; who holds which clearance).
- **P0 only exercises RUO (architecture).** It never touches the gateway, so it proves nothing about the Clinical guarantee. → **D21:** P0 must include **one end‑to‑end Clinical verdict** through a real Clinical Decision Module + arbitrator + audit; and the `EngineAdapter.run()` contract is **network‑shaped from P0** (async, serializable, idempotency key, explicit error taxonomy) so the →Approach‑C seam is real.
- **Concordance gate underspecified (clinical).** → **D22:** define ground truth, pre‑registered **sensitivity/specificity for catching unsafe outputs** (not just agreement), sample size, adversarial edge‑case set, disagreement adjudication. Also: multi‑engine **disagreement** resolution must be deterministic (or force `cannot_advise`).
- **Inherited seed‑data debt.** Reused CYP2D6/CYP2C19 PGx tables + citations are unvalidated seed; manifest signing is a TODO. → **D23:** explicit blocker on any Clinical go‑live; finish SME validation + manifest signing + Change Control Board gating before P2.

## B.3 Decision Log (review‑driven additions)

| # | Decision |
|---|---|
| D11 | Generalize CDS decision/evidence model; per‑domain **Clinical Decision Module** (rules + evidence + safety tables). "Reuse unchanged / small adapter" retracted. |
| D12 | **Origination Invariant:** deterministic non‑ML rule must originate any `recommend`; engines/ML only block/annotate/rank. Testable + hazard‑tested. |
| D13 | **MD descoped from Clinical dosing in v1** (RUO/visualization only); Clinical dosing via validated PK/PD ODE. |
| D14 | (a) Cache key += `tenant_id, tier`, ref‑DB hashes. (b) Reproducibility **tiered**; engine provenance bound into evidence + `verdict_hash`; audit = recompute‑from‑stored‑outputs. |
| D15 | Multi‑tenancy is **net‑new**: tenant_id bound + enforced everywhere; per‑tenant audit chain; server‑side BAA gate; residency. |
| D16 | RUO **de‑identification enforced** at input; genomic/variant data = PHI → Clinical/BAA only. |
| D17 | Auth hardening: JWKS+kid+per‑tenant issuer; RS256/ES256‑only; HS256 forbidden for Clinical; Clinical auth not disableable. |
| D18 | GDPR via **crypto‑shredding**; no raw PHI in audit payloads. |
| D19 | **Intended‑use spine first** per first Clinical domain → class + regulatory route. |
| D20 | Counsel‑reviewed **regulatory liability model** replaces BAA‑as‑firewall. |
| D21 | **P0 proves the gateway** (one end‑to‑end Clinical verdict); adapter contract network‑shaped from P0. |
| D22 | Quantitative concordance gate (sensitivity/specificity for unsafe‑catch) + deterministic multi‑engine disagreement resolution. |
| D23 | Inherited seed‑data + unsigned‑manifest debt is a hard Clinical go‑live blocker (SME validation + signing + CCB before P2). |

## B.4 Revised phasing

```
P0  (a) network-shaped EngineAdapter contract + job runtime
    (b) net-new multi-tenancy foundations: tenant_id binding, per-tenant audit
        chain, tenant+tier cache partition, RUO de-id input gate
    (c) RUO docking end-to-end  AND  ONE end-to-end Clinical verdict through a
        real (first-domain) Clinical Decision Module + arbitrator + audit  ← proves BOTH paths
    (d) intended-use statement + class/route for the first Clinical domain
P1  Drug-Combination RUO breadth + first-domain Clinical (oncology) through the 4 gates
P2  Simulation: PK/PD-ODE Clinical (deterministic); MD as RUO/visualization only
    (+ close seed-data validation + manifest signing + CCB)
P3  Expand Clinical domains one validated step at a time
P4  AR/XR hardening (cross-module view)
P5  Partner API GA (docs, SDKs, BAA onboarding, tiered billing)
```

## B.5 Pre‑Phase‑0 gate (must‑fix — blocks any implementation)

1. **Intended‑use statement** (first Clinical domain) → IEC 62304 class + FDA/MDR route. *(D19)*
2. **Generalized decision/evidence model + first Clinical Decision Module spec**, proving a non‑PGx engine result becomes a grounded `recommend` without forcing `cannot_advise`; **Origination Invariant** expressed as a testable rule + hazard test. *(D11, D12, D21)*
3. **MD descoped** from Clinical v1 (or a defined analytical‑validation standard). *(D13)*
4. **Engine provenance bound** into evidence + `verdict_hash`; reproducibility claims restated by tier. *(D14)*
5. **Corrected reuse inventory** + designed net‑new multi‑tenancy (tenant binding, per‑tenant audit chain, **tenant+tier cache partition**, server‑side BAA gate, residency). *(D15, D14a)*
6. **RUO de‑identification input gate** live before RUO accepts traffic. *(D16)*
7. **Clinical auth hardening** designed in (no‑disable, RS256/ES256‑only, JWKS). *(D17)*
8. **GDPR crypto‑shredding + no‑raw‑PHI‑in‑audit** rule. *(D18)*
9. **Counsel‑reviewed liability model**. *(D20)*

Items 2, 5, and the cache/audit tenancy fixes (1–2 in security terms) are the hardest blockers: they live in P0 and require changing the **reused** `src/cds` decision/evidence path and `src/cds/audit` + job‑runtime contracts that everything downstream inherits.

**Status:** Design v2 is review‑complete. Implementation remains **gated** on closing the B.5 must‑fix items (each producing a small spec/decision), after which a Phase‑0 implementation plan can be drafted.
