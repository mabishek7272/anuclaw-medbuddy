# ANUClaw EHR & Patient Record System

Universal Patient ID (UID) system, full patient profile management, PHR/EHR integration, HL7 messaging, FHIR resources, EMR/EHR connectivity, and healthcare interoperability.

## When to Use
- Registering a new patient and issuing their UID (this is the ONLY place UIDs are created)
- Looking up or verifying an existing UID
- Managing a patient's full PMR/EHR profile (demographics, clinical history, medications)
- Adding diagnoses, prescriptions, or lab reports to a registered patient record
- Generating HL7 v2 messages for a registered patient
- Converting a patient profile to a FHIR R4 resource
- Querying a FHIR server using an EHR-issued UID
- Healthcare data exchange and interoperability

> **Do NOT use this skill** to validate UIDs that were created outside this system.
> Any UID not present in the authority store (`uid_registry.db`) will be rejected.

---

## Universal Patient ID (UID) System

### Authority Rule
**The UID may only be issued by this skill (anuclaw-ehr-patient — the PMR/EHR system).**
No other skill, agent, or external caller may generate or assign a UID.
All other skills that need to reference a patient must receive the UID as input; they cannot create one.

### UID Format
```
AMGI-{CC}-{YYYY}-{NNNNNNN}
```
- `AMGI`    — system namespace prefix
- `CC`      — ISO 3166-1 alpha-2 country code where the patient is registered (US, IN, GB, SG, AU…)
- `YYYY`    — 4-digit year of first registration in this system
- `NNNNNNN` — 7-digit zero-padded sequential counter, auto-incremented per `(country, year)` pair

Examples:
```
AMGI-US-2026-0000001   ← first patient registered in the US in 2026
AMGI-US-2026-0000002   ← second US patient
AMGI-IN-2026-0000001   ← first patient registered in India — counter is independent of US
AMGI-GB-2026-0000001   ← first patient registered in the UK
AMGI-US-2027-0000001   ← US counter resets each new year
```

**Why country-scoped?**
A patient registered in the US (`AMGI-US-2026-0000001`) and a patient registered in India (`AMGI-IN-2026-0000001`) are distinct people. Without the country code, both would receive `AMGI-2026-0000001` and collide.

**When a patient moves between countries:**
Their original UID never changes. The receiving country's EHR system records the foreign UID as a cross-reference identifier alongside the new local record. No new UID is issued for an existing patient.

The UID is **opaque** — it encodes only country and year, never name, date of birth, or gender, preventing reverse-engineering of personal data from the ID alone.

### UID Registry (SQLite — EHR authority store)
```python
import sqlite3
import os
import re
from datetime import datetime

UID_REGISTRY_PATH = os.environ.get("ANUCLAW_UID_REGISTRY", "/workspace/data/uid_registry.db")

# Valid ISO 3166-1 alpha-2 country codes (extend as needed)
_VALID_COUNTRY_CODES = {
    "US", "GB", "IN", "AU", "CA", "SG", "NZ", "ZA", "AE", "SA",
    "DE", "FR", "IT", "ES", "NL", "SE", "NO", "DK", "FI", "CH",
    "JP", "KR", "CN", "BR", "MX", "AR", "CL", "CO", "PK", "BD",
    "NG", "KE", "GH", "EG", "MA", "TH", "MY", "ID", "PH", "VN",
}

def _validate_country_code(cc: str) -> str:
    """Normalise and validate an ISO 3166-1 alpha-2 country code."""
    cc = cc.strip().upper()
    if cc not in _VALID_COUNTRY_CODES:
        raise ValueError(
            f"'{cc}' is not a recognised ISO 3166-1 alpha-2 country code. "
            f"Supported codes: {sorted(_VALID_COUNTRY_CODES)}"
        )
    return cc

def _get_uid_conn():
    """Return a connection to the UID registry database."""
    os.makedirs(os.path.dirname(UID_REGISTRY_PATH), exist_ok=True)
    conn = sqlite3.connect(UID_REGISTRY_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS uid_registry (
            uid           TEXT PRIMARY KEY,
            country_code  TEXT NOT NULL,
            year          INTEGER NOT NULL,
            seq           INTEGER NOT NULL,
            first_name    TEXT NOT NULL,
            last_name     TEXT NOT NULL,
            date_of_birth TEXT NOT NULL,
            gender        TEXT NOT NULL,
            registered_at TEXT NOT NULL,
            issued_by     TEXT NOT NULL DEFAULT 'anuclaw-ehr-patient',
            foreign_uids  TEXT NOT NULL DEFAULT '[]'
        )
    """)
    # Counter is scoped per (country_code, year) — each country has its own sequence
    conn.execute("""
        CREATE TABLE IF NOT EXISTS uid_counter (
            country_code TEXT NOT NULL,
            year         INTEGER NOT NULL,
            last_seq     INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (country_code, year)
        )
    """)
    conn.commit()
    return conn

def _next_seq(conn, country_code: str, year: int) -> int:
    """Atomically increment and return the next sequence for (country, year)."""
    conn.execute(
        "INSERT INTO uid_counter (country_code, year, last_seq) VALUES (?, ?, 1) "
        "ON CONFLICT(country_code, year) DO UPDATE SET last_seq = last_seq + 1",
        (country_code, year)
    )
    conn.commit()
    row = conn.execute(
        "SELECT last_seq FROM uid_counter WHERE country_code = ? AND year = ?",
        (country_code, year)
    ).fetchone()
    return row[0]

def issue_uid(
    first_name: str,
    last_name: str,
    date_of_birth: str,
    gender: str,
    country_code: str,
) -> dict:
    """
    AUTHORITY FUNCTION — only callable by the EHR/PMR skill.
    Issues a new AMGI-{CC}-{YYYY}-{NNNNNNN} UID scoped to the patient's country.

    Rules:
    - A patient already registered in the SAME country returns their existing UID.
    - A patient registered in a DIFFERENT country receives a new UID for that country;
      the foreign UID is stored as a cross-reference.
    - country_code must be a valid ISO 3166-1 alpha-2 code.
    """
    cc = _validate_country_code(country_code)
    year = datetime.utcnow().year
    conn = _get_uid_conn()

    fn, ln = first_name.strip().upper(), last_name.strip().upper()

    # Check if the same patient is already registered in THIS country
    existing_same_country = conn.execute(
        "SELECT uid FROM uid_registry "
        "WHERE first_name=? AND last_name=? AND date_of_birth=? AND gender=? AND country_code=?",
        (fn, ln, date_of_birth, gender.upper(), cc)
    ).fetchone()
    if existing_same_country:
        conn.close()
        return {
            "uid": existing_same_country[0],
            "status": "existing",
            "country_code": cc,
            "message": f"Patient already registered in {cc}. Returning existing UID.",
        }

    # Check if the same patient exists in a DIFFERENT country (cross-country registration)
    existing_other_country = conn.execute(
        "SELECT uid, country_code FROM uid_registry "
        "WHERE first_name=? AND last_name=? AND date_of_birth=? AND gender=? AND country_code != ?",
        (fn, ln, date_of_birth, gender.upper(), cc)
    ).fetchone()
    foreign_uid = existing_other_country[0] if existing_other_country else None

    # Issue a new UID for this country
    seq = _next_seq(conn, cc, year)
    uid = f"AMGI-{cc}-{year}-{seq:07d}"
    registered_at = datetime.utcnow().isoformat()
    foreign_uids_json = f'["{foreign_uid}"]' if foreign_uid else "[]"

    conn.execute(
        "INSERT INTO uid_registry "
        "(uid, country_code, year, seq, first_name, last_name, date_of_birth, gender, registered_at, foreign_uids) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (uid, cc, year, seq, fn, ln, date_of_birth, gender.upper(), registered_at, foreign_uids_json)
    )

    # Back-link: record this new UID in the original country's foreign_uids too
    if foreign_uid:
        conn.execute(
            "UPDATE uid_registry SET foreign_uids = json_insert(foreign_uids, '$[#]', ?) WHERE uid = ?",
            (uid, foreign_uid)
        )

    conn.commit()
    conn.close()

    result = {"uid": uid, "status": "issued", "country_code": cc, "registered_at": registered_at}
    if foreign_uid:
        result["cross_reference"] = {
            "note": "Patient has an existing UID in another country.",
            "foreign_uid": foreign_uid,
            "foreign_country": existing_other_country[1],
        }
    return result

def lookup_uid(uid: str) -> dict:
    """Verify a UID exists in the authority store and return its full registration record."""
    conn = _get_uid_conn()
    row = conn.execute(
        "SELECT uid, country_code, first_name, last_name, date_of_birth, gender, registered_at, foreign_uids "
        "FROM uid_registry WHERE uid = ?", (uid,)
    ).fetchone()
    conn.close()
    if not row:
        return {"valid": False, "uid": uid, "message": "UID not found in registry."}
    return {
        "valid": True,
        "uid": row[0],
        "country_code": row[1],
        "first_name": row[2],
        "last_name": row[3],
        "date_of_birth": row[4],
        "gender": row[5],
        "registered_at": row[6],
        "foreign_uids": row[7],  # JSON array of UIDs in other countries
    }

def lookup_patient_by_country(first_name: str, last_name: str, date_of_birth: str, gender: str) -> list:
    """Find all UIDs for a patient across all countries they are registered in."""
    conn = _get_uid_conn()
    rows = conn.execute(
        "SELECT uid, country_code, registered_at FROM uid_registry "
        "WHERE first_name=? AND last_name=? AND date_of_birth=? AND gender=?",
        (first_name.strip().upper(), last_name.strip().upper(), date_of_birth, gender.upper())
    ).fetchall()
    conn.close()
    return [{"uid": r[0], "country_code": r[1], "registered_at": r[2]} for r in rows]

def validate_uid_before_record_write(uid: str) -> None:
    """
    Call this at the top of any function that writes to a patient record.
    Raises ValueError if the UID was not issued by this authority.
    All other skills that accept a UID as input must call this before writing.
    """
    result = lookup_uid(uid)
    if not result["valid"]:
        raise ValueError(
            f"UID '{uid}' is not registered in the AMGI EHR authority store. "
            "A patient must be registered via the EHR/PMR system before records can be written."
        )
```

---

### create_patient_profile — EHR Entry Point

```python
import uuid
from datetime import datetime

def create_patient_profile(data: dict) -> dict:
    """
    Register a new patient and issue a country-scoped UID.
    This is the ONLY authorised entry point for patient creation.

    Required fields in data:
      first_name, last_name, date_of_birth, gender, country_code (ISO 3166-1 alpha-2)

    The issued UID format: AMGI-{CC}-{YYYY}-{NNNNNNN}
    """
    if "country_code" not in data:
        raise ValueError(
            "country_code is required to register a patient. "
            "Provide an ISO 3166-1 alpha-2 code, e.g. 'US', 'IN', 'GB'."
        )
    uid_result = issue_uid(
        data["first_name"], data["last_name"],
        data["date_of_birth"], data["gender"],
        data["country_code"],
    )
    uid = uid_result["uid"]
    return {
        "uid": uid,
        "uid_status": uid_result["status"],
        "country_code": uid_result["country_code"],
        "cross_reference": uid_result.get("cross_reference"),  # set if patient exists in another country
        "demographics": {
            "first_name": data["first_name"],
            "last_name": data["last_name"],
            "date_of_birth": data["date_of_birth"],
            "gender": data["gender"],
            "country_code": uid_result["country_code"],
            "nationality": data.get("nationality"),
            "language": data.get("language", "English"),
            "address": data.get("address"),
            "phone": data.get("phone"),
            "email": data.get("email"),
        },
        "clinical": {
            "blood_group": data.get("blood_group"),
            "allergies": data.get("allergies", []),
            "chronic_conditions": data.get("chronic_conditions", []),
            "current_medications": data.get("current_medications", []),
            "vaccination_records": data.get("vaccination_records", []),
            "surgical_history": data.get("surgical_history", []),
            "family_history": data.get("family_history", {}),
        },
        "administrative": {
            "insurance_provider": data.get("insurance_provider"),
            "insurance_id": data.get("insurance_id"),
            "emergency_contacts": data.get("emergency_contacts", []),
            "primary_physician": data.get("primary_physician"),
            "preferred_hospital": data.get("preferred_hospital"),
        },
        "records": {
            "diagnoses": [],
            "prescriptions": [],
            "lab_reports": [],
            "imaging_reports": [],
        },
        "created_at": datetime.utcnow().isoformat(),
        "last_updated": datetime.utcnow().isoformat(),
    }
```

---
```

---

## Patient Profile Sections

> **Important:** All record-write functions below call `validate_uid_before_record_write()` first.
> If the UID was not issued by the EHR/PMR authority store, the function raises `ValueError` and
> no record is written. The UID must already exist — it cannot be created here.

### Medical Records Management
```python
def add_diagnosis(profile: dict, diagnosis: dict) -> dict:
    """Add a diagnosis to a registered patient profile. UID must be EHR-issued."""
    validate_uid_before_record_write(profile["uid"])
    entry = {
        "id": str(uuid.uuid4()),
        "icd10_code": diagnosis.get("icd10_code"),
        "snomed_code": diagnosis.get("snomed_code"),
        "description": diagnosis["description"],
        "severity": diagnosis.get("severity", "moderate"),
        "diagnosed_by": diagnosis.get("diagnosed_by"),
        "diagnosed_at": diagnosis.get("diagnosed_at", datetime.utcnow().isoformat()),
        "status": diagnosis.get("status", "active"),
        "notes": diagnosis.get("notes", ""),
    }
    profile["records"]["diagnoses"].append(entry)
    profile["last_updated"] = datetime.utcnow().isoformat()
    return profile

def add_prescription(profile: dict, rx: dict) -> dict:
    """Add a prescription to a registered patient profile. UID must be EHR-issued."""
    validate_uid_before_record_write(profile["uid"])
    entry = {
        "id": str(uuid.uuid4()),
        "medication_name": rx["medication_name"],
        "dosage": rx["dosage"],
        "frequency": rx["frequency"],
        "route": rx.get("route", "oral"),
        "start_date": rx["start_date"],
        "end_date": rx.get("end_date"),
        "prescribed_by": rx.get("prescribed_by"),
        "indication": rx.get("indication"),
        "status": rx.get("status", "active"),
    }
    profile["records"]["prescriptions"].append(entry)
    profile["last_updated"] = datetime.utcnow().isoformat()
    return profile

def add_lab_report(profile: dict, lab: dict) -> dict:
    """Add a lab report to a registered patient profile. UID must be EHR-issued."""
    validate_uid_before_record_write(profile["uid"])
    entry = {
        "id": str(uuid.uuid4()),
        "test_name": lab["test_name"],
        "loinc_code": lab.get("loinc_code"),
        "value": lab["value"],
        "unit": lab.get("unit"),
        "reference_range": lab.get("reference_range"),
        "flag": lab.get("flag"),  # H/L/N/C
        "ordered_by": lab.get("ordered_by"),
        "performed_at": lab.get("performed_at"),
        "reported_at": lab.get("reported_at", datetime.utcnow().isoformat()),
        "notes": lab.get("notes", ""),
    }
    profile["records"]["lab_reports"].append(entry)
    profile["last_updated"] = datetime.utcnow().isoformat()
    return profile
```

---

## HL7 v2 Message Parsing
```python
def parse_hl7_v2(raw_message: str) -> dict:
    """Parse an HL7 v2 message into structured Python dict."""
    segments = {}
    for line in raw_message.strip().split('\n'):
        if not line.strip():
            continue
        fields = line.split('|')
        seg_id = fields[0]
        segments[seg_id] = fields[1:]

    result = {"raw_segments": segments}

    # Parse MSH — Message header
    if "MSH" in segments:
        msh = segments["MSH"]
        result["message_type"] = msh[7] if len(msh) > 7 else None
        result["message_datetime"] = msh[5] if len(msh) > 5 else None

    # Parse PID — Patient identification
    if "PID" in segments:
        pid = segments["PID"]
        result["patient"] = {
            "patient_id": pid[2] if len(pid) > 2 else None,
            "name": pid[4] if len(pid) > 4 else None,
            "dob": pid[6] if len(pid) > 6 else None,
            "gender": pid[7] if len(pid) > 7 else None,
            "address": pid[10] if len(pid) > 10 else None,
            "phone": pid[12] if len(pid) > 12 else None,
        }

    # Parse OBX — Observation result
    if "OBX" in segments:
        obx = segments["OBX"]
        result["observation"] = {
            "value_type": obx[1] if len(obx) > 1 else None,
            "identifier": obx[2] if len(obx) > 2 else None,
            "value": obx[4] if len(obx) > 4 else None,
            "units": obx[5] if len(obx) > 5 else None,
            "reference_range": obx[6] if len(obx) > 6 else None,
            "abnormal_flag": obx[7] if len(obx) > 7 else None,
        }
    return result

def generate_hl7_adt_a01(uid: str, ward: str = "WARD^001^01^HOSPITAL") -> str:
    """
    Generate an HL7 ADT A01 (Admit) message for a registered patient.
    UID is validated against the EHR authority store; country code is embedded in the PID segment.
    Raises ValueError if the UID is unknown.
    """
    reg = lookup_uid(uid)
    if not reg["valid"]:
        raise ValueError(f"Cannot generate HL7 message: {reg['message']}")
    now = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    name = f"{reg['last_name']}^{reg['first_name']}"
    dob = reg["date_of_birth"].replace("-", "")
    gender_code = reg["gender"][0].upper() if reg["gender"] else "U"
    cc = reg["country_code"]
    # PID-3: patient ID list — uid^^^AMGI-{CC} makes the country-scoped namespace explicit
    return (
        f"MSH|^~\\&|ANUClaw|AMGI-{cc}|EHR|HOSPITAL|{now}||ADT^A01|{uuid.uuid4().hex[:10].upper()}|P|2.5\n"
        f"EVN|A01|{now}\n"
        f"PID|1||{uid}^^^AMGI-{cc}||{name}||{dob}|{gender_code}\n"
        f"PV1|1|I|{ward}||||||||||||||||ADM"
    )
```

---

## FHIR R4 Resource Operations
```python
from fhir.resources.patient import Patient
from fhir.resources.observation import Observation
from fhir.resources.medicationrequest import MedicationRequest
from fhir.resources.condition import Condition
from fhir.resources.bundle import Bundle
import json
import requests

FHIR_BASE_URL = "http://localhost:8080/fhir"  # Configure your FHIR server

def patient_to_fhir(profile: dict) -> dict:
    """
    Convert an ANUClaw patient profile to a FHIR R4 Patient resource.
    UID is validated against the EHR authority store before conversion.
    """
    validate_uid_before_record_write(profile["uid"])
    return {
        "resourceType": "Patient",
        "id": profile["uid"],
        "identifier": [
            {
                "system": "https://amgi-research.github.io/uid",
                "value": profile["uid"],
                "use": "official",
            }
        ],
        "name": [{
            "family": profile["demographics"]["last_name"],
            "given": [profile["demographics"]["first_name"]],
        }],
        "birthDate": profile["demographics"]["date_of_birth"],
        "gender": profile["demographics"]["gender"].lower(),
        "telecom": [{"system": "phone", "value": profile["demographics"].get("phone", "")}],
    }

def query_fhir_patient(uid: str) -> dict:
    """
    Query a FHIR server for a patient by UID.
    UID is validated against the EHR authority store before the request is made.
    """
    validate_uid_before_record_write(uid)
    response = requests.get(
        f"{FHIR_BASE_URL}/Patient",
        params={"identifier": f"https://amgi-research.github.io/uid|{uid}"}
    )
    return response.json()

def get_patient_everything(uid: str) -> dict:
    """
    Get all records for a patient using the FHIR $everything operation.
    UID is validated against the EHR authority store before the request is made.
    """
    validate_uid_before_record_write(uid)
    response = requests.get(f"{FHIR_BASE_URL}/Patient/{uid}/$everything")
    return response.json()
```

---

## Healthcare Interoperability
```python
def check_interoperability_standards(system_info: dict) -> dict:
    """Assess a system's healthcare interoperability readiness."""
    checklist = {
        "HL7_v2_support": False,
        "FHIR_R4_support": False,
        "SMART_on_FHIR": False,
        "IHE_profiles": False,
        "DICOM_support": False,
        "CDA_support": False,
        "terminology_services": False,
        "audit_logging_ATNA": False,
    }
    score = sum(checklist.values())
    return {"checklist": checklist, "score": f"{score}/{len(checklist)}", "recommendation": "Enable FHIR R4 as primary interoperability layer"}
```

## Output
- UID registry (authority store): `/workspace/data/uid_registry.db` — SQLite, never expose directly
- Patient profiles (JSON): `/workspace/output/patients/<UID>.json`
- HL7 messages: `/workspace/output/hl7/<UID>_<timestamp>.hl7`
- FHIR bundles: `/workspace/output/fhir/<UID>_bundle.json`

## UID Authority Summary

**Format:** `AMGI-{CC}-{YYYY}-{NNNNNNN}`  
**Counter scope:** independent per country — US and IN each have their own sequence  
**Duplicate rule:** same patient in same country → same UID returned; same patient in new country → new UID issued + cross-reference stored

| Action | Who can do it |
|---|---|
| Issue a new UID | `anuclaw-ehr-patient` (this skill) only |
| Look up / verify a UID | `anuclaw-ehr-patient` only |
| Find all UIDs for a patient across countries | `lookup_patient_by_country()` — EHR only |
| Write records using a UID | Any skill — **after** `validate_uid_before_record_write()` passes |
| Accept a UID as input | Any skill — but must call `validate_uid_before_record_write()` first |
| Create a UID independently | **Forbidden** — all other skills must route through EHR/PMR |

**Supported country codes (ISO 3166-1 alpha-2):**  
US, GB, IN, AU, CA, SG, NZ, ZA, AE, SA, DE, FR, IT, ES, NL, SE, NO, DK, FI, CH,  
JP, KR, CN, BR, MX, AR, CL, CO, PK, BD, NG, KE, GH, EG, MA, TH, MY, ID, PH, VN
