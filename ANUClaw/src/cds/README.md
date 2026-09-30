# ANUClaw v3 — Deterministic Decision Core + Safety Layer (`src/cds`)

Phases 1–2 of the [v3 Hospital-Grade CDS plan](../../../ANUClaw_v3_CDS_Implementation_Plan/ANUClaw_v3_CDS_Implementation_Plan.md):
the **deterministic decision core** and the **safety layer** for pharmacogenomic
dosing support (CYP2D6 / CYP2C19), built before any evidence, FHIR, or LLM layer.

## Core principle

> Deterministic rules make the clinical decision. **No machine learning runs in
> this module** — phenotype and recommendation are pure table lookups, fully
> reproducible from the audit fields they emit.

`src/cds` must never import an LLM/agent/model. That invariant is what makes the
later safety argument (IEC 62304 Class C) tractable.

## Pipeline (this slice covers plan §3.1 stages 5–7)

```
raw genotype ──▶ genotype-normaliser ──▶ phenotype-engine ──▶ rule-engine
   '*4/*1'         '*1/*4' (canonical)     Poor Metabolizer     CPIC recommendation
```

`evaluateDecisionCore({ gene, diplotype, drug })` wires the three together and
returns one of: `normalisation_failed`, `indeterminate`, or `decided`
(with the phenotype and the rule lookup). Every result carries the data
**version + SHA-256 integrity hash** that produced it.

## Files

| File | Role | Plan ref |
|------|------|----------|
| `types.ts` | Domain types (alleles, phenotypes, rules) | §2, §4 |
| `hashing.ts` | Canonical key-sorted SHA-256 | §4.1.3 |
| `genotype-normaliser.ts` | Star-allele standardisation (`*NxM` duplications) | §3.1 stage 5 |
| `phenotype-engine.ts` | Diplotype → phenotype, pure | §4.1 |
| `rule-engine.ts` | (gene, drug, phenotype) → recommendation, exact-match | §4.2 |
| `registry.ts` | Versioned loader + **fail-closed** integrity check (genes, rules, safety tables) | §3.3, §4.2.3 |
| `data/*.ts` | Versioned, sealed gene + rule tables | §4.1.3, Appendix A |
| `data/manifest.ts` | **Auto-generated** integrity manifest | §4.2.3 |
| `safety/missing-data.ts` | Required-field completeness; absent vs confirmed-none | §7.4 |
| `safety/contraindication.ts` | Drug × conditions; absolute → block, relative → warn | §7.1 |
| `safety/interaction.ts` | Drug × active meds; contraindicated → block, major → warn | §7.2 |
| `safety/allergy.ts` | Drug/class match + cross-sensitivity | §7.3 |
| `safety/arbitrator.ts` | Authority hierarchy → one verdict; deterministic `verdict_hash` | §5.1, §2.2 |
| `safety/data/*.ts` | Versioned, sealed safety rule tables | §7.5, Appendix A |
| `evidence/evidence-engine.ts` | Citation resolution, version pinning, contradiction detection, **no-citation block** | §4.3, §5.2 |
| `evidence/data/citations.ts` | Versioned, sealed pinned citation store | §4.3 |
| `explanation/template-provider.ts` | Deterministic, verdict-faithful narrative (default + §3.3 fallback) | §3.3 |
| `explanation/consistency-guard.ts` | Mechanically catches any narrative contradicting the verdict | §2.2, stage 14 |
| `explanation/explanation-service.ts` | Generate → guard → regenerate N → escalate; LLM injected, non-authoritative | §3.1 stages 13–14, §3.2 |
| `fhir/snapshot-from-fhir.ts` | FHIR prefetch + order context → `PatientSnapshot` (absent/confirmed-none/unknown) | §6.2, §6.4 |
| `hooks/card-builder.ts` | Verdict + explanation → CDS Card (indicator/summary/detail/source/links) | §6.3 |
| `hooks/cds-hooks.ts` | CDS Hooks discovery + framework-agnostic `order-sign` handler | §6.3 |
| `hooks/router.ts` | Express adapter: `GET /cds-services`, `POST /cds-services/:id` | §6.3 |
| `audit/audit-log.ts` | Append-only, hash-chained log; verify, signed export, 21 CFR Part 11 sign-off | §5.4 |
| `audit/async-audit-log.ts` + `audit/postgres-sink.ts` | Async log + **Postgres** sink (DB-level append-only trigger) | §5.4 |
| `audit/sinks.ts` | Append-only storage (in-memory + JSONL file) | §5.4 |
| `audit/audited-pipeline.ts` | Runs stages 4–14 then records all events; **halts on audit-write failure** | §3.2 |
| `review/review-service.ts` | Evaluate an order for review + record clinician Accept/Modify/Reject | §5.3 |
| `review/router.ts` + `review/page.ts` | Express routes + server-rendered review UI (navy/teal) | §5.3 |
| `pipeline.ts` | `runPipeline` (stages 4–12) + `runPipelineWithExplanation` (4–14) | §3.1 |

`runPipeline({ snapshot, gene })` runs completeness → phenotype → rule → the four
safety engines → arbitration, returning a `Verdict`
(`recommend` / `block` / `cannot_advise` / `no_guideline`) plus an audit trace.
**Safety always wins**: any single engine BLOCK forces `decision = 'block'` and
suppresses the recommendation (plan §5.1, §2.2).

## Running it in the app

The engine is mounted into the API server ([`src/api/routes/cds.ts`](../api/routes/cds.ts),
wired in [`src/api/server.ts`](../api/server.ts)) with a durable, Postgres-backed,
hash-chained audit log:

```
GET  /cds-services                CDS Hooks discovery
POST /cds-services/anuclaw-pgx-dosing   CDS Hooks invocation (order-sign)
POST /cds/review/evaluate         run the pipeline for an order
POST /cds/review/signoff          clinician sign-off (e-signature)
GET  /cds/review/audit/export     signed audit bundle
GET  /cds/review/audit/verify     chain verification
GET  /cds/review/demo             rendered clinician review page
```

Each evaluation is recorded to the audit log **before** its result is returned,
so an audit-write failure becomes a 500 and no card is emitted (plan §3.2). The
route uses the app's existing `pg` pool via a minimal `PgPoolLike` adapter, so
`src/cds` never imports `pg`. The `cds_audit_log` table + its append-only trigger
are created lazily on first request (`PostgresAuditSink.ensureSchema`).

### Auth (SMART on FHIR / CDS Hooks, §6.5)

- `GET /cds-services` is **public** (per the CDS Hooks spec).
- `POST /cds-services/:id` requires the EHR-issued **CDS Hooks JWT** (signature +
  `exp` + issuer allowlist + audience).
- `/cds/review/*` require a **SMART access token** with scopes — read scope for
  evaluate/export/demo, plus a write scope for `signoff`.

Config is env-driven (`CDS_JWT_PUBLIC_KEY`/`CDS_JWT_SECRET`, `CDS_TRUSTED_ISSUERS`,
`CDS_AUDIENCE`, `CDS_REQUIRED_SCOPES`, `CDS_SIGNOFF_SCOPES`, `CDS_AUTH_ENABLED`).
Auth is **fail-closed**: a bad/missing token → 401, insufficient scope → 403. It
is **off in dev** until a key is configured (the router logs a loud warning), so
the demo stays reachable locally. Pure verification + SMART scope matching live in
[`src/cds/security/`](security/); the Express middleware is
[`src/api/middleware/cds-auth.ts`](../api/middleware/cds-auth.ts). JWKS-by-URL is
not yet implemented — configure the issuer's public key.

## Two phenotype methods (faithful to CPIC)

- **`activity_score`** (CYP2D6): sum per-allele activity values × copy number,
  then a phenotype band. Bands: PM = 0, IM `(0, 1.0]`, NM `(1.0, 2.25]`,
  UM `> 2.25`.
- **`diplotype_function`** (CYP2C19): lookup on the order-independent pair of
  allele functional statuses. The map is exhaustive over the four function
  classes.

Any unannotated allele or out-of-band score returns **`Indeterminate`** — never
a guess (plan §4.1.3).

## Change control: sealing data files

Gene/rule tables are change-controlled artifacts. After **any** edit to a file
under `data/`, re-seal so the registry will accept it:

```bash
tsx scripts/cds-seal.ts      # recomputes data/manifest.ts
npm test -- src/cds          # verify
```

An unsealed edit is detected on load and **halts** (`CdsIntegrityError`),
implementing plan §3.3 "Rule table version mismatch → halt". In production,
sealing must be gated by Change Control Board review (plan §11.2), and the
manifest itself should be cryptographically **signed** (TODO — not yet built).

## ⚠ Seed data is NOT clinically validated

The allele tables and CPIC recommendations under `data/` are **illustrative seed
content** to exercise the engine mechanics. They require pharmacogenomics SME
review and sign-off against the cited guideline versions (plan §4.2, §8.3, §11.2)
before any clinical use. Each data file carries a `notice` to this effect.

## Built so far

- **Phase 1** — deterministic decision core (genotype → phenotype → CPIC rule).
- **Phase 2** — four independent safety engines + arbitrator + composed pipeline.
- **Evidence (§4.3)** — citation resolution, version pinning, contradiction
  detection, and the mandatory no-citation block, gated into the arbitrator.
- **Explanation (§2.2, §3.1 stages 13–14)** — the LLM is injected (never imported
  into `src/cds`) and non-authoritative; every narrative passes the consistency
  guard, regenerates on contradiction, escalates after N failures, and falls back
  to a deterministic template when the model is unavailable. `runPipelineWithExplanation`
  runs the full stages 4–14.
- **FHIR / CDS Hooks ingress (§6)** — an `order-sign` hook in, a CDS Card out, with
  the FHIR prefetch → `PatientSnapshot` normaliser between. Mount via
  `createCdsHooksRouter()` or call `handleHook()` directly.
- **Audit (§5.4)** — append-only, hash-chained log with tamper detection, signed
  bundle export, and 21 CFR Part 11 clinician sign-off. `runAuditedPipeline` (and
  the hook handler with `auditLog`) record every event and **halt rather than emit
  a card if an audit write fails** (§3.2). Durable backends: in-memory, JSONL file,
  and **Postgres** (`PostgresAuditSink` + `AsyncAuditLog`, DB-level append-only trigger).
- **Clinician review (§5.3)** — `evaluateForReview` runs the pipeline for an order
  and returns review items; the **light-theme CDS console** (`GET /cds/review`,
  preloaded at `/cds/review/demo`) has a tabbed UI (Review / Audit / Service): a
  "new evaluation" form, result tiles with per-card Accept / Modify / Reject,
  live audit verify/export, and a SMART token field. `submitSignOff` records the
  decision (override/modify requires a structured reason) chained onto the same
  audit log. `npm run cds:preview` renders a static `cds-console-preview.html`.

## The LLM is the lowest authority

The explanation layer is the only place a model touches output, and it cannot
alter the decision. If a narrative contradicts the verdict the guard discards and
regenerates it; **the verdict is never changed to match the prose**. The default
narrator is a deterministic template that is faithful by construction, so the
LLM-free path always passes the guard on the first attempt.

## Not yet built (later phases)

The SMART/CDS-Hooks token **guard is in place** (§6.5); what remains is JWKS-by-URL
key resolution (currently a configured public key), HL7 v2 ingest (§6.1), and
embedding the review page into the dashboard SPA (the server-rendered page works
standalone). See plan §§6, 9–10. **All clinical seed data remains illustrative and
requires SME validation before use.**
