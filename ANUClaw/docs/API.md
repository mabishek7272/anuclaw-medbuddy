# ANUClaw API — Developer Reference

**Built by AMGI Research (Abi and Anu)**  
**Base URL:** `https://api.anuclaw.amgi-research.com/api/v1`  
**Local dev:** `http://localhost:4000/api/v1`

---

## Overview

The ANUClaw API lets any company integrate ANUClaw's 1100+ domain skills — genomics, drug discovery, clinical decision support, EHR/patient records, lab automation, protein design, and regulatory compliance — directly into their own application.

Your application calls our API. ANUClaw runs the agent, executes the skill in an isolated container, and returns the result. You never need to host a model or manage infrastructure.

---

## Quick Start (3 steps)

### Step 1 — Register your company

```bash
curl -X POST https://api.anuclaw.amgi-research.com/api/v1/register \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Acme Pharma",
    "email": "dev@acmepharma.com",
    "plan": "pro"
  }'
```

Response:
```json
{
  "message": "Registration successful. Store your API key securely — it will not be shown again.",
  "tenant_id": "3f2a1b4c-...",
  "company_name": "Acme Pharma",
  "plan": "pro",
  "api_key": "amgi_live_a1b2c3d4e5f6...",
  "rate_limit_per_min": 60,
  "monthly_quota": 5000
}
```

> Store `api_key` immediately. It is shown only once.

---

### Step 2 — Call a skill

```bash
curl -X POST https://api.anuclaw.amgi-research.com/api/v1/skills/anuclaw-drug-discovery/run \
  -H "X-API-Key: amgi_live_a1b2c3d4e5f6..." \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Predict ADMET properties for the compound SMILES: CC(=O)Oc1ccccc1C(=O)O"
  }'
```

Response:
```json
{
  "skill": "anuclaw-drug-discovery",
  "group_id": "api-3f2a1b4c-...-1717000000",
  "result": "...",
  "tenant_id": "3f2a1b4c-..."
}
```

---

### Step 3 — Register a patient (EHR)

```bash
curl -X POST https://api.anuclaw.amgi-research.com/api/v1/ehr/patients \
  -H "X-API-Key: amgi_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Jane",
    "last_name": "Smith",
    "date_of_birth": "1985-04-12",
    "gender": "female",
    "country_code": "US"
  }'
```

Response includes the issued UID:
```json
{
  "result": {
    "uid": "AMGI-US-2026-0000001",
    "uid_status": "issued",
    "country_code": "US",
    ...
  }
}
```

---

## Authentication

All endpoints except `/health` and `/register` require authentication.

### Method 1 — API Key (simplest)

Add your API key as a header:

```
X-API-Key: amgi_live_<your_key>
```

### Method 2 — JWT Bearer Token (recommended for production)

Exchange your API key for a short-lived JWT (valid 1 hour):

```bash
curl -X POST /api/v1/token \
  -H "X-API-Key: amgi_live_..."
```

Then use the JWT in subsequent requests:

```
Authorization: Bearer <jwt>
```

---

## Plans & Limits

All plans are currently **unlimited** — no rate limits, no monthly quotas.
Use as much as you need.

| Plan | Rate limit | Monthly quota |
|---|---|---|
| **free** | Unlimited | Unlimited |
| **pro** | Unlimited | Unlimited |
| **enterprise** | Unlimited | Unlimited |

Usage is still tracked and available via `GET /api/v1/usage` for your own monitoring.

---

## Endpoints

### Authentication & Account

#### `POST /register`
Register a new company.

**Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| `company_name` | string | ✅ | Your company name |
| `email` | string | ✅ | Contact email (unique) |
| `plan` | string | — | `free` (default), `pro`, `enterprise` |

---

#### `POST /token`
Exchange API key for JWT.

**Header:** `X-API-Key: amgi_live_...`

**Response:** `{ access_token, token_type, expires_in, tenant_id, plan }`

---

#### `GET /account`
Get your account details, plan, and usage.

---

#### `PUT /account/plan`
Upgrade your plan.

**Body:** `{ "plan": "pro" }`

---

#### `PUT /account/webhook`
Register a webhook URL for async skill results.

**Body:** `{ "url": "https://your-app.com/webhook" }`

When a skill run completes, ANUClaw will `POST` the result to this URL.

---

### Skills

#### `GET /skills`
List all available skills.

**Response:**
```json
{
  "skills": [
    { "name": "anuclaw-genomics", "description": "..." },
    { "name": "anuclaw-drug-discovery", "description": "..." },
    { "name": "anuclaw-clinical", "description": "..." },
    ...
  ]
}
```

---

#### `POST /skills/:skill/run`
Execute a skill with a natural-language prompt.

**Path param:** `:skill` — one of the skill names from `GET /skills`

**Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| `prompt` | string | ✅ | The task or question |
| `group_id` | string | — | Session ID. Reuse across calls to share memory. |
| `max_turns` | number | — | Max agent reasoning steps. Default: 5 |
| `stream` | boolean | — | Stream chunks as NDJSON. Default: false |

**Example — genomics:**
```bash
curl -X POST /api/v1/skills/anuclaw-genomics/run \
  -H "X-API-Key: ..." \
  -d '{
    "prompt": "Run a BLAST search for this sequence: ATGCGATCGATCG and identify the organism",
    "group_id": "my-research-session-1"
  }'
```

**Example — drug discovery:**
```bash
curl -X POST /api/v1/skills/anuclaw-drug-discovery/run \
  -d '{ "prompt": "What are the drug-drug interactions between warfarin and aspirin?" }'
```

**Example — clinical:**
```bash
curl -X POST /api/v1/skills/anuclaw-clinical/run \
  -d '{ "prompt": "Summarise the latest clinical trials for PD-1 inhibitors in NSCLC" }'
```

**Streaming response (NDJSON):**
```json
{"type":"chunk","text":"Running ADMET analysis..."}
{"type":"chunk","text":"Lipophilicity (LogP): 1.2..."}
{"type":"done","result":"...","skill":"anuclaw-drug-discovery","group_id":"..."}
```

---

#### `POST /skills/run`
Same as above but `skill` is in the request body (useful if the skill name is dynamic).

**Body:** `{ "skill": "anuclaw-genomics", "prompt": "..." }`

---

### EHR / Patient Records

> All EHR endpoints enforce the UID authority rule.
> UIDs must be issued by the EHR system — they cannot be invented or submitted externally.

---

#### `POST /ehr/patients`
Register a new patient and receive a country-scoped UID.

**Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| `first_name` | string | ✅ | |
| `last_name` | string | ✅ | |
| `date_of_birth` | string | ✅ | ISO 8601: `YYYY-MM-DD` |
| `gender` | string | ✅ | `male`, `female`, `other` |
| `country_code` | string | ✅ | ISO 3166-1 alpha-2: `US`, `IN`, `GB`, `AU`… |
| `blood_group` | string | — | e.g. `A+` |
| `allergies` | array | — | List of allergy strings |
| `phone` | string | — | |
| `email` | string | — | |
| `insurance_provider` | string | — | |

**UID format returned:** `AMGI-{CC}-{YYYY}-{NNNNNNN}`

---

#### `GET /ehr/patients/:uid`
Look up a patient by their UID.

```bash
GET /api/v1/ehr/patients/AMGI-US-2026-0000001
```

---

#### `GET /ehr/patients/search`
Find all UIDs for a patient across countries.

```
GET /api/v1/ehr/patients/search?first_name=Jane&last_name=Smith&date_of_birth=1985-04-12&gender=female
```

---

#### `POST /ehr/patients/:uid/diagnoses`
Add a diagnosis to a patient record.

**Body:**
| Field | Type | Required |
|---|---|---|
| `description` | string | ✅ |
| `icd10_code` | string | — |
| `snomed_code` | string | — |
| `severity` | string | — |
| `diagnosed_by` | string | — |

---

#### `POST /ehr/patients/:uid/prescriptions`
Add a prescription.

**Body:** `medication_name`, `dosage`, `frequency`, `start_date` (required) + `route`, `prescribed_by`, `indication` (optional)

---

#### `POST /ehr/patients/:uid/lab-reports`
Add a lab report.

**Body:** `test_name`, `value` (required) + `unit`, `loinc_code`, `reference_range`, `flag`, `ordered_by` (optional)

---

#### `POST /ehr/patients/:uid/hl7`
Generate an HL7 ADT A01 admission message.

**Body:** `{ "ward": "WARD^001^01^HOSPITAL" }` (optional)

---

#### `POST /ehr/patients/:uid/fhir`
Convert patient profile to a FHIR R4 Patient resource.

---

### Usage

#### `GET /usage`
Get your usage stats, daily breakdown, and top skills.

```json
{
  "plan": "pro",
  "usage_this_month": 142,
  "monthly_quota": 5000,
  "usage_total": 1034,
  "daily_breakdown": [
    { "day": "2026-06-12", "calls": 23 },
    ...
  ],
  "top_skills": [
    { "skill": "anuclaw-drug-discovery", "calls": 58 },
    ...
  ]
}
```

---

## SDKs & Code Examples

### Python

```python
import requests

API_KEY = "amgi_live_..."
BASE    = "https://api.anuclaw.amgi-research.com/api/v1"
HEADERS = {"X-API-Key": API_KEY, "Content-Type": "application/json"}

# Run a drug discovery skill
resp = requests.post(
    f"{BASE}/skills/anuclaw-drug-discovery/run",
    headers=HEADERS,
    json={"prompt": "Dock aspirin against COX-2 (PDB: 5KIR) and report the binding score"}
)
print(resp.json()["result"])

# Register a patient
resp = requests.post(
    f"{BASE}/ehr/patients",
    headers=HEADERS,
    json={
        "first_name": "Alice", "last_name": "Patel",
        "date_of_birth": "1990-03-22", "gender": "female",
        "country_code": "IN"
    }
)
uid = resp.json()["result"]["uid"]   # AMGI-IN-2026-0000001
print(f"Patient UID: {uid}")
```

### JavaScript / TypeScript

```typescript
const BASE    = 'https://api.anuclaw.amgi-research.com/api/v1';
const API_KEY = 'amgi_live_...';

async function runSkill(skill: string, prompt: string): Promise<string> {
  const res = await fetch(`${BASE}/skills/${skill}/run`, {
    method:  'POST',
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ prompt }),
  });
  const data = await res.json();
  return data.result;
}

// Example
const result = await runSkill('anuclaw-clinical', 'Explain the mechanism of metformin in T2DM');
console.log(result);
```

### cURL (shell scripts)

```bash
# One-liner skill run
curl -s -X POST "$BASE/skills/anuclaw-genomics/run" \
  -H "X-API-Key: $ANUCLAW_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Align these two sequences and report identity: ATGCGA and ATGCTA"}' \
  | jq .result
```

---

## Error Codes

| HTTP | Code | Meaning |
|---|---|---|
| 400 | Bad Request | Missing or invalid fields |
| 401 | Unauthorized | Invalid or missing API key / JWT |
| 404 | Not Found | Skill or resource not found |
| 409 | Conflict | Email already registered |
| 429 | Too Many Requests | Rate limit or monthly quota exceeded |
| 500 | Internal Server Error | Skill execution or server error |

---

## Webhooks

Register a webhook URL to receive async results:

```bash
curl -X PUT /api/v1/account/webhook \
  -H "X-API-Key: ..." \
  -d '{ "url": "https://your-app.com/anuclaw-webhook" }'
```

ANUClaw will POST to your URL with:

```json
{
  "event":    "skill.completed",
  "skill":    "anuclaw-genomics",
  "group_id": "...",
  "result":   "...",
  "tenant_id": "..."
}
```

---

## Data Isolation

Each company's data is fully isolated:

- All agent containers run in separate Linux namespaces
- Memory and session data is scoped to `api-{tenant_id}-{group_id}`
- No tenant can access another tenant's data
- Patient UIDs are stored in the EHR authority store; only the EHR skill can issue them
- No training or learning from tenant API calls

---

## Contact

Built by **AMGI Research — Abi and Anu**  
Enterprise plans, custom skill development, on-premise deployment: contact AMGI.
