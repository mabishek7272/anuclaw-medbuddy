# E-LAB — Operator Runbook (internal demo)

How to stand up and demo the E-LAB clinical engine platform. **Internal proof-of-value only — clinical content is seed/unvalidated; not for patient care.**

## Prerequisites
- Node 20+, `npm install` in `ANUClaw/`.
- **Docker running** (only for the docking engine).
- Build the docking image once:
  ```
  docker build -t anuclaw-vina:latest - < container/vina.Dockerfile
  ```

## Fastest demo — one command, no database
```
npm run elab:demo
```
Open **http://localhost:4099/v1/elab**. Everything works out of the box (in-memory, stub auth):

- **Drug Combination (Clinical) tab**
  - **Evaluate** → a guideline-grounded `recommend` verdict (HER2+ regimen, LVEF 60) with citations.
  - **Load low-LVEF (block) example** → a `block` verdict (trastuzumab cardiotoxicity contraindication) — shows safety overriding the recommendation.
  - Try a regimen not in the rules → `no_guideline`; blank out LVEF → `cannot_advise` (missing data).
- **Engines (RUO) tab**
  - **Dock** → real **AutoDock Vina** run (Open Babel preps PDBQT from SMILES) → best affinity + per-mode table. Genuine engine, demo molecules.

What to point out in the demo: deterministic rule *originates* the recommendation; the synergy/engine outputs are *supporting only*; any safety hit *blocks*; every result is hash-chained into a per-tenant audit log.

## Full server (Postgres + real auth + admin)
For the tiered API with real tenants/keys:
```
# set Postgres + ADMIN_API_KEY in .env (see .env.example), then:
npm run start:api      # API only, no messaging channels  (needs Postgres)
```
- Info: `GET http://localhost:4000/api/v1`
- CDS Hooks discovery: `GET /cds-services`
- Register a tenant: `POST /api/v1/register` → get its `api_key`.
- Grant clinical access (admin):
  ```
  curl -X POST http://localhost:4000/api/v1/admin/tenants/<TENANT_ID>/clinical-grant \
    -H "X-Admin-Key: $ADMIN_API_KEY" -H "content-type: application/json" \
    -d '{"domains":["oncology-combination"]}'
  ```
- Call the clinical tier with the tenant key:
  ```
  curl -X POST http://localhost:4000/v1/clinical/drug-combination \
    -H "X-API-Key: <TENANT_API_KEY>" -H "content-type: application/json" \
    -d '{"query":{...},"context":{...}}'
  ```
- RUO docking: `POST /v1/ruo/docking-vina` with `X-API-Key` + a prepared PDBQT input.

## Tests / health
```
npm test                       # full suite (220+ tests)
npx tsx scripts/elab-ui-smoke.ts   # boots the console + demo clinical + real dock over HTTP
```

## Tiers (separately licensed)
- **RUO (researcher licence)** — `ruo` scope, non-diagnostic, de-identified input enforced. Can ship now.
- **Clinical (separate licence + BAA)** — `clinical` scope + active BAA + enabled domain. Gated on counsel (#9) + SME validation + the 4 validation gates (see the counsel/SME packets).

## Reminders
- Re-seal after editing any `src/cds/**/data` file: `npm run cds:seal`.
- Clinical content is **seed/illustrative** — replace with SME-validated content before any clinical use.
