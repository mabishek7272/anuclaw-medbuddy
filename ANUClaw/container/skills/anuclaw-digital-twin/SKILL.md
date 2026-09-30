# ANUClaw Digital Patient Twin

Digital patient twin modelling, predictive disease monitoring, longitudinal health record analysis, emergency risk alerts, and hospital interoperability simulation.

## When to Use
- Build or update a patient's digital twin from health records
- Run predictive disease progression models
- Generate longitudinal dataset summaries across visits
- Simulate care pathways and intervention outcomes
- Produce hospital interoperability status reports

---

## Digital Patient Twin

```python
from datetime import datetime, date
from typing import List, Dict, Optional
import json

def build_digital_twin(profile: dict) -> dict:
    """
    Build a comprehensive digital patient twin from an ANUClaw patient profile.
    Captures current state, trend vectors, and predictive risk scores.
    """
    now = datetime.utcnow().isoformat()

    # Derive age
    try:
        dob = datetime.strptime(profile["demographics"]["date_of_birth"], "%Y-%m-%d").date()
        age_years = (date.today() - dob).days // 365
    except Exception:
        age_years = None

    # Trend analysis on lab results
    labs = profile["records"].get("lab_reports", [])
    lab_trends = _compute_lab_trends(labs)

    # Active medication burden
    active_rx = [r for r in profile["records"].get("prescriptions", []) if r.get("status") == "active"]

    # Diagnosis load
    active_dx = [d for d in profile["records"].get("diagnoses", []) if d.get("status") == "active"]

    twin = {
        "uid": profile["uid"],
        "twin_version": "1.0",
        "generated_at": now,
        "demographics_snapshot": {
            "age_years": age_years,
            "gender": profile["demographics"].get("gender"),
            "blood_group": profile["clinical"].get("blood_group"),
        },
        "current_state": {
            "active_diagnoses_count": len(active_dx),
            "active_medications_count": len(active_rx),
            "known_allergies": profile["clinical"].get("allergies", []),
            "chronic_conditions": profile["clinical"].get("chronic_conditions", []),
            "polypharmacy_flag": len(active_rx) >= 5,
        },
        "lab_trends": lab_trends,
        "risk_vectors": _compute_risk_vectors(profile, age_years, active_rx, active_dx),
        "longitudinal_summary": _longitudinal_summary(profile),
    }
    return twin


def _compute_lab_trends(lab_reports: list) -> dict:
    """Group lab results by test name and compute simple trend (latest vs previous)."""
    grouped: Dict[str, list] = {}
    for lab in sorted(lab_reports, key=lambda x: x.get("reported_at", "")):
        name = lab["test_name"].lower()
        grouped.setdefault(name, []).append(lab)

    trends = {}
    for name, entries in grouped.items():
        if len(entries) >= 2:
            try:
                latest = float(entries[-1]["value"])
                prev = float(entries[-2]["value"])
                delta = round(latest - prev, 4)
                direction = "rising" if delta > 0 else "falling" if delta < 0 else "stable"
            except (ValueError, TypeError):
                delta, direction = None, "unknown"
            trends[name] = {
                "latest_value": entries[-1]["value"],
                "latest_unit": entries[-1].get("unit", ""),
                "latest_flag": entries[-1].get("flag"),
                "delta": delta,
                "direction": direction,
                "observations": len(entries),
            }
        elif len(entries) == 1:
            trends[name] = {
                "latest_value": entries[0]["value"],
                "latest_unit": entries[0].get("unit", ""),
                "latest_flag": entries[0].get("flag"),
                "delta": None,
                "direction": "single_observation",
                "observations": 1,
            }
    return trends


def _compute_risk_vectors(profile: dict, age: Optional[int], active_rx: list, active_dx: list) -> dict:
    """Compute high-level risk vectors for the twin."""
    risks = {}

    # Polypharmacy risk
    risks["polypharmacy"] = {
        "score": len(active_rx),
        "flag": len(active_rx) >= 5,
        "note": "Review for interactions" if len(active_rx) >= 5 else "Within acceptable range",
    }

    # Age-related risk
    if age is not None:
        risks["age_risk"] = {
            "age": age,
            "category": "Elderly" if age >= 65 else "Middle-aged" if age >= 45 else "Adult",
            "frailty_screen_recommended": age >= 70,
        }

    # Chronic disease burden
    chronic = profile["clinical"].get("chronic_conditions", [])
    risks["chronic_burden"] = {
        "count": len(chronic),
        "conditions": chronic,
        "high_burden": len(chronic) >= 3,
    }

    # Allergy risk
    allergies = profile["clinical"].get("allergies", [])
    risks["allergy_profile"] = {
        "count": len(allergies),
        "documented": allergies,
        "alert": len(allergies) > 0,
    }

    return risks


def _longitudinal_summary(profile: dict) -> dict:
    """Summarise the longitudinal record span."""
    dates = []
    for dx in profile["records"].get("diagnoses", []):
        if dx.get("diagnosed_at"):
            dates.append(dx["diagnosed_at"][:10])
    for lab in profile["records"].get("lab_reports", []):
        if lab.get("reported_at"):
            dates.append(lab["reported_at"][:10])
    for rx in profile["records"].get("prescriptions", []):
        if rx.get("start_date"):
            dates.append(rx["start_date"][:10])

    dates = sorted(set(dates))
    return {
        "first_event": dates[0] if dates else None,
        "last_event": dates[-1] if dates else None,
        "record_span_days": (
            (datetime.strptime(dates[-1], "%Y-%m-%d") - datetime.strptime(dates[0], "%Y-%m-%d")).days
            if len(dates) >= 2 else 0
        ),
        "total_events": (
            len(profile["records"].get("diagnoses", [])) +
            len(profile["records"].get("lab_reports", [])) +
            len(profile["records"].get("prescriptions", []))
        ),
    }
```

---

## Predictive Disease Monitoring

```python
def predict_disease_progression(twin: dict) -> dict:
    """
    Generate disease progression predictions from digital twin risk vectors.
    Returns prioritised monitoring recommendations.
    """
    alerts = []
    recommendations = []

    risks = twin.get("risk_vectors", {})
    trends = twin.get("lab_trends", {})

    # Polypharmacy monitoring
    if risks.get("polypharmacy", {}).get("flag"):
        alerts.append({
            "type": "POLYPHARMACY",
            "severity": "MODERATE",
            "message": f"{risks['polypharmacy']['score']} active medications — deprescribing review advised",
        })

    # Rising abnormal labs
    for test_name, trend in trends.items():
        if trend.get("direction") == "rising" and trend.get("latest_flag") in ["H", "C"]:
            alerts.append({
                "type": "RISING_ABNORMAL_LAB",
                "severity": "HIGH",
                "message": f"{test_name.title()} is rising and abnormally high ({trend['latest_value']} {trend['latest_unit']})",
            })
        elif trend.get("direction") == "falling" and trend.get("latest_flag") in ["L", "C"]:
            alerts.append({
                "type": "FALLING_ABNORMAL_LAB",
                "severity": "HIGH",
                "message": f"{test_name.title()} is falling and abnormally low ({trend['latest_value']} {trend['latest_unit']})",
            })

    # Chronic burden
    if risks.get("chronic_burden", {}).get("high_burden"):
        recommendations.append("Multi-disciplinary care review recommended (3+ chronic conditions)")

    # Age-based screening
    age_risk = risks.get("age_risk", {})
    if age_risk.get("frailty_screen_recommended"):
        recommendations.append("Frailty screening (e.g., CFS / Edmonton Frail Scale) recommended at age ≥70")

    return {
        "uid": twin["uid"],
        "generated_at": datetime.utcnow().isoformat(),
        "alerts": sorted(alerts, key=lambda x: {"HIGH": 0, "MODERATE": 1, "LOW": 2}.get(x["severity"], 3)),
        "recommendations": recommendations,
        "monitoring_frequency": "Weekly" if any(a["severity"] == "HIGH" for a in alerts) else "Monthly",
    }
```

---

## Longitudinal Dataset Builder

```python
def build_longitudinal_dataset(profiles: list) -> list:
    """
    Build a research-grade longitudinal dataset from a list of patient profiles.
    Each row represents one patient-event. Suitable for cohort analysis.
    """
    rows = []
    for profile in profiles:
        uid = profile["uid"]
        try:
            dob = datetime.strptime(profile["demographics"]["date_of_birth"], "%Y-%m-%d").date()
            age = (date.today() - dob).days // 365
        except Exception:
            age = None
        gender = profile["demographics"].get("gender", "Unknown")

        for dx in profile["records"].get("diagnoses", []):
            rows.append({
                "uid": uid, "age_at_event": age, "gender": gender,
                "event_type": "DIAGNOSIS", "event_date": dx.get("diagnosed_at", "")[:10],
                "event_code": dx.get("icd10_code", ""), "event_description": dx["description"],
                "severity": dx.get("severity", ""), "status": dx.get("status", ""),
            })

        for lab in profile["records"].get("lab_reports", []):
            rows.append({
                "uid": uid, "age_at_event": age, "gender": gender,
                "event_type": "LAB_RESULT", "event_date": lab.get("reported_at", "")[:10],
                "event_code": lab.get("loinc_code", ""), "event_description": lab["test_name"],
                "value": lab["value"], "unit": lab.get("unit", ""), "flag": lab.get("flag", ""),
            })

        for rx in profile["records"].get("prescriptions", []):
            rows.append({
                "uid": uid, "age_at_event": age, "gender": gender,
                "event_type": "PRESCRIPTION", "event_date": rx.get("start_date", "")[:10],
                "event_code": "", "event_description": rx["medication_name"],
                "dosage": rx["dosage"], "status": rx.get("status", ""),
            })

    return sorted(rows, key=lambda r: (r["uid"], r.get("event_date", "")))


def export_longitudinal_csv(rows: list) -> str:
    """Export longitudinal dataset to CSV string."""
    import csv, io
    if not rows:
        return ""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue()
```

---

## Hospital Interoperability Report

```python
def generate_interoperability_report(systems: list) -> dict:
    """
    Generate a hospital interoperability assessment across multiple systems.
    systems: list of dicts with 'name' and 'capabilities' (list of standard names)
    """
    standards = ["HL7_v2", "FHIR_R4", "SMART_on_FHIR", "DICOM", "CDA", "IHE", "SNOMED_CT", "LOINC", "ICD10"]
    report = {"generated_at": datetime.utcnow().isoformat(), "systems": [], "gaps": []}

    for system in systems:
        caps = [c.upper().replace(" ", "_") for c in system.get("capabilities", [])]
        coverage = {std: any(std in cap or cap in std for cap in caps) for std in standards}
        score = sum(coverage.values())
        report["systems"].append({
            "name": system["name"],
            "coverage": coverage,
            "score": f"{score}/{len(standards)}",
            "ready_for_exchange": score >= 5,
        })

    # Identify cross-system gaps
    all_coverage = {}
    for std in standards:
        supported_by = [s["name"] for s in report["systems"] if s["coverage"].get(std)]
        if len(supported_by) < len(systems):
            report["gaps"].append({
                "standard": std,
                "supported_by": supported_by,
                "missing_in": [s["name"] for s in systems if s["name"] not in supported_by],
            })

    return report
```

## Output
Save digital twin JSON to `/workspace/output/twins/`. Save longitudinal datasets as CSV and JSON to `/workspace/output/research/`. Save interoperability reports as JSON to `/workspace/output/interop/`.
