# E‑LAB Phase‑0 Implementation Plan (Provisional)

Companion to `ELAB_Clinical_Engine_Platform_Design.md` (v2) and `ELAB_Gate_Specs_Oncology.md`.

> **Provisional & gated.** Clinical‑tier **production / partner** deployment remains gated on **#9 (counsel‑reviewed liability model)** *and* the four per‑domain validation gates. P0 builds the engineering scaffolding + the RUO path + **one** end‑to‑end Clinical path **in a validation environment using SEED (unvalidated) oncology content** — it must not be used for patient care. Starting to write P0 code is a separate go‑decision.

## Goal of Phase 0

Prove **both paths end‑to‑end** on net‑new multi‑tenant foundations:
1. **RUO** raw‑engine path (docking), with the de‑identification gate.
2. **One Clinical verdict** through a real oncology `ClinicalDecisionModule` → safety → arbitrator → per‑tenant audit → sign‑off, with **INV‑ORIG** enforced.

If both work with cross‑tenant isolation and reproducibility, the architecture is validated and later phases are "more of the same."

---

## Workstreams (atomic tasks · acceptance criteria)

### WS‑A — Engine layer & adapter contract — `src/engines/` *(new)*
- [ ] **A1** Define `EngineAdapter<In,Out>` + `EngineResult` — **network‑shaped** (async, serializable, idempotency key, explicit error taxonomy: `invalid_input|timeout|crashed|unavailable`, `reproducibility_class`). *AC: types compile; canonical input‑hash unit test.*
- [ ] **A2** `DockingEngine` over AutoDock Vina — typed `DockingInput/DockingResult`, deterministic command invocation (**no LLM/agent**), provenance (tool ver, params, container digest). *AC: golden test (fixed receptor+ligand → affinity within tolerance); determinism test (same input+version → same output hash).*
- [ ] **A3** Engine **validation registry** + sealed manifest (generalize `src/cds/registry` pattern); `validated` gates Clinical. *AC: unvalidated version cannot serve Clinical (fail‑closed test).*

### WS‑B — Async job runtime *(new)*
- [ ] **B1** `Job` model + queue + lifecycle (`queued→running→succeeded|failed|timed_out|cancelled`) + CPU worker pool. *AC: lifecycle tests; timeout → `failed` + fail‑closed.*
- [ ] **B2** Content‑addressed cache keyed `(tenant_id, tier, engine_id, engine_version, input_hash, refdb_hashes)`; concurrent‑job dedup; invalidation policy. *AC: cache‑hit correctness; **different tenant ⇒ cache miss** (isolation).*
- [ ] **B3** Completion delivery: SSE (E‑LAB) · poll endpoint · **signed + tenant‑pinned webhook**. *AC: each path delivers; PHI scrubbed from payloads.*

### WS‑C — Multi‑tenancy foundations *(net‑new; extends `src/api` + `src/cds/audit`)*
- [ ] **C1** Tenant model: `scopes[]`, `baa_status`, `residency`, `allowed_clinical_domains[]` + migration. *AC: migration applies; CRUD.*
- [ ] **C2** Token **tenant binding** middleware; enforce `tenant_id` at every data/cache/artifact/audit boundary. *AC: cross‑tenant access denied tests.*
- [ ] **C3** **Per‑tenant audit chain** — change `src/cds/audit` to composite `(tenant_id, seq)`; per‑tenant `head/verify/export`; Postgres `PRIMARY KEY (tenant_id, seq)` + no‑mutate trigger. *AC: per‑tenant chain verifies; export scoped; tamper detection intact; **existing CDS v3 audit tests still pass**.* ⚠ changes reused code — coordinate with CDS owners.
- [ ] **C4** Clinical gate middleware: `scope=clinical` **AND** server‑side `baa_status=active` **AND** `domain∈allowed` **AND** residency match; fail‑closed. *AC: each missing condition → 403.*
- [ ] **C5** Auth hardening: JWKS‑by‑URL + `kid` + per‑tenant issuer map; **RS256/ES256‑only** in prod; **HS256 forbidden for clinical**; **clinical auth not disableable** (config validation fails closed). *AC: a test per rule.*

### WS‑D — RUO tier end‑to‑end *(proves path 1)*
- [ ] **D1** `POST /v1/ruo/dock` (scope `ruo`, **de‑identification input gate** per Spec 5) → DockingEngine via job runtime → raw artifact + non‑diagnostic label. *AC: end‑to‑end returns result; de‑id gate rejects PHI/genomic input.*
- [ ] **D2** RUO metering (existing `usage-meter`) + per‑tenant quota. *AC: usage logged per call.*

### WS‑E — First Clinical Decision Module (oncology) + gateway *(proves path 2)*
- [ ] **E1** Generalize CDS decision/evidence: `ClinicalDecisionModule` interface; parameterize `groundEvidence` to a **domain evidence store** (beyond CPIC). *AC: **existing PGx tests still pass** (regression); oncology evidence store loads + seals.*
- [ ] **E2** Oncology **regimen‑indication rule table** (sealed, versioned) = the originator; extend `ClinicalContext` (organ function, biomarkers, prior therapy). *AC: criteria‑match lookup tests; no rule → `no_guideline`.*
- [ ] **E3** **INV‑ORIG** enforcement in the arbitrator + hazard test. *AC: high synergy + no deterministic indication → verdict ≠ `recommend`; a `recommend` requires `originated_by=deterministic_rule`.*
- [ ] **E4** Clinical adapter: engine outputs → `SupportingEvidence` (provenance bound, ranking/annotation only); **bind provenance into `verdict_hash`**. *AC: verdict_hash includes engine provenance; two different runs ⇒ different hash.*
- [ ] **E5** `POST /v1/clinical/drug-combination` (clinical gate) → module → safety (DDI/contra/allergy/missing) → arbitrate → guarded `Verdict` + clinician sign‑off; per‑tenant audit. *AC: HER2+ regimen → `recommend` w/ guideline citation + supporting evidence; low‑LVEF → `block`; missing organ function → `cannot_advise`; full chain audited + re‑verifiable.*

### WS‑G — Privacy / GDPR foundations *(before any PHI touches the system)*
- [ ] **G1** Crypto‑shredding scaffolding (per‑subject key; PHI/artifacts encrypted; erasure = destroy key); audit payloads store only hashes / pseudonymous `subject_ref`. *AC: erasure test — key destroyed → artifact unrecoverable, **audit chain intact**.*
- [ ] **G2** PHI scrubbing on logs/errors/SSE/webhook. *AC: no PHI in egress test.*

### WS‑F — E‑LAB reference UI (thin; lowest P0 priority)
- [ ] **F1** Rebuild E‑LAB modules as **consumers** of `/v1/ruo/*` + `/v1/clinical/*` (no clinical logic in UI), reusing the light‑theme console. *AC: renders an RUO docking result and a clinical verdict card; sign‑off posts.*

---

## Sequencing & dependencies

```
A1 + C1,C2  (adapter contract + tenant binding)        ← foundations, first
   ↓
B1,B2,B3 + A2,A3 + C3,C4,C5 + G1,G2                     ← runtime, engine, tenancy, privacy
   ↓
D1,D2   (RUO path)  ──────────────── proves PATH 1
   ↓
E1→E5   (oncology clinical module) ── proves PATH 2     (depends on A,B,C,G)
   ↓
F1      (thin reference UI)                              ← last
```

## Phase‑0 exit criteria
- [ ] RUO docking end‑to‑end; de‑id gate enforced.
- [ ] One oncology Clinical verdict end‑to‑end (each of recommend / block / cannot_advise / no_guideline reachable) through the real module + arbitrator + **per‑tenant** audit; **INV‑ORIG hazard test green**.
- [ ] Cross‑tenant isolation green (data, **cache**, **audit**).
- [ ] Verdict re‑derivable from stored outputs; engine provenance in `verdict_hash`.
- [ ] **All existing `src/cds` tests still pass** (regression) + new tests + typecheck green.

## Risks / caveats carried into P0
- **Seed content:** the oncology regimen rules + evidence store are **illustrative/unvalidated** (like the CDS PGx seed data) — validation environment only; oncology SME sign‑off + the 4 gates required before any clinical use.
- **Reused‑code change:** C3 modifies `src/cds/audit` (global → per‑tenant chain); must keep CDS v3 green and be coordinated.
- **#9 (counsel)** still gates Clinical **production/partner** exposure; P0 is build + test only.

## Rough sizing (no false precision)
WS‑A **M** · WS‑B **M** · WS‑C **L** (touches reused audit + auth + tenancy) · WS‑D **S** · WS‑E **L** (the generalization + first module is the hard core) · WS‑G **M** · WS‑F **S**.

---

**Next decision:** approve starting P0 implementation on the **non‑#9‑blocked** work (foundations + RUO + the validation‑environment Clinical path), or hold the whole build until #9 closes.
