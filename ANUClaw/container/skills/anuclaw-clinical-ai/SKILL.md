# ANUClaw Clinical AI — 2nd Opinion & Decision Support

Risk prediction models, clinical report generation, patient timeline analysis, predictive disease monitoring, emergency risk alerts, medication tracking, and second-opinion assistance. ANUClaw acts as a 2nd-line doctor and second opinion medical application.

## When to Use
- User needs a second medical opinion or clinical reasoning support
- Generate a structured clinical report from patient data
- Build a patient timeline from records
- Predict disease risk from patient profile
- Medication tracking and interaction monitoring
- Emergency risk scoring (sepsis, deterioration, fall risk)
- Clinical decision support at the point of care

## ⚠️ Disclaimer
ANUClaw clinical AI outputs are decision **support** tools for qualified healthcare professionals. They do not replace clinical judgment, physical examination, or professional diagnosis.

---

## Second Opinion & Clinical Reasoning
```python
def second_opinion_analysis(patient_profile: dict, presenting_complaint: str) -> str:
    """
    Generate a structured second opinion analysis.
    Returns a differential diagnosis with reasoning, flags, and recommendations.
    """
    prompt = f"""
You are acting as a second-opinion clinical consultant for a healthcare professional.

PATIENT SUMMARY:
- Age/Gender: {patient_profile['demographics'].get('date_of_birth', 'Unknown')} / {patient_profile['demographics'].get('gender', 'Unknown')}
- Blood Group: {patient_profile['clinical'].get('blood_group', 'Unknown')}
- Known Allergies: {', '.join(patient_profile['clinical'].get('allergies', [])) or 'None documented'}
- Chronic Conditions: {', '.join(patient_profile['clinical'].get('chronic_conditions', [])) or 'None documented'}
- Current Medications: {', '.join([m if isinstance(m, str) else m.get('medication_name', '') for m in patient_profile['clinical'].get('current_medications', [])]) or 'None'}
- Family History: {patient_profile['clinical'].get('family_history', {})}
- Recent Diagnoses: {[d['description'] for d in patient_profile['records'].get('diagnoses', [])[-3:]]}
- Recent Labs: {[f"{l['test_name']}: {l['value']} {l.get('unit','')}" for l in patient_profile['records'].get('lab_reports', [])[-5:]]}

PRESENTING COMPLAINT: {presenting_complaint}

Please provide:
1. DIFFERENTIAL DIAGNOSIS (ranked by probability with reasoning)
2. RED FLAGS to watch for
3. RECOMMENDED INVESTIGATIONS
4. TREATMENT CONSIDERATIONS
5. FOLLOW-UP RECOMMENDATIONS
6. ANY DRUG INTERACTIONS or CONTRAINDICATIONS given current medications

Note: This is a second opinion to assist a qualified clinician. Always defer to the treating physician's judgment.
"""
    return prompt  # Returned as prompt for Claude to complete
```

---

## Risk Prediction Models
```python
import numpy as np
from datetime import datetime, date

def calculate_sepsis_risk(vitals: dict, labs: dict) -> dict:
    """
    qSOFA Sepsis Risk Score.
    Score ≥ 2 indicates high risk of sepsis-related organ dysfunction.
    """
    score = 0
    flags = []

    rr = vitals.get("respiratory_rate", 0)
    if rr >= 22:
        score += 1
        flags.append(f"Respiratory rate ≥22 ({rr}/min)")

    sbp = vitals.get("systolic_bp", 120)
    if sbp <= 100:
        score += 1
        flags.append(f"Systolic BP ≤100 ({sbp} mmHg)")

    gcs = vitals.get("gcs", 15)
    if gcs < 15:
        score += 1
        flags.append(f"Altered mentation (GCS {gcs})")

    return {
        "score": score,
        "max_score": 3,
        "risk": "HIGH" if score >= 2 else "LOW",
        "flags": flags,
        "recommendation": "Urgent clinical review recommended" if score >= 2 else "Monitor closely",
        "tool": "qSOFA"
    }

def calculate_cardiovascular_risk(patient: dict, labs: dict) -> dict:
    """Framingham 10-year cardiovascular risk estimation."""
    try:
        dob = datetime.strptime(patient["demographics"]["date_of_birth"], "%Y-%m-%d").date()
        age = (date.today() - dob).days // 365
    except Exception:
        age = 55  # default

    gender = patient["demographics"].get("gender", "M").upper()
    total_chol = labs.get("total_cholesterol", 200)
    hdl = labs.get("hdl_cholesterol", 50)
    sbp = labs.get("systolic_bp", 120)
    smoker = labs.get("smoker", False)
    diabetic = labs.get("diabetic", False)

    # Simplified Framingham scoring
    base_risk = 0.05
    if age > 65: base_risk += 0.10
    elif age > 55: base_risk += 0.05
    if total_chol > 240: base_risk += 0.05
    if hdl < 40: base_risk += 0.05
    if sbp > 140: base_risk += 0.05
    if smoker: base_risk += 0.08
    if diabetic: base_risk += 0.07

    risk_pct = round(min(base_risk * 100, 30), 1)
    return {
        "10_year_cvd_risk_percent": risk_pct,
        "risk_category": "High" if risk_pct > 20 else "Intermediate" if risk_pct > 10 else "Low",
        "tool": "Framingham (simplified)",
        "note": "Use validated clinical tools for actual patient care"
    }

def calculate_fall_risk(patient: dict) -> dict:
    """Morse Fall Scale assessment."""
    score = 0
    factors = []
    if patient["clinical"].get("surgical_history"):
        score += 25; factors.append("History of falls/surgery (+25)")
    if len(patient["clinical"].get("current_medications", [])) >= 3:
        score += 15; factors.append("Multiple medications (+15)")
    if patient["clinical"].get("chronic_conditions"):
        for c in patient["clinical"]["chronic_conditions"]:
            if any(x in c.lower() for x in ["parkinson", "stroke", "arthritis", "vertigo"]):
                score += 15; factors.append(f"Diagnosis affecting mobility: {c} (+15)"); break
    return {
        "morse_score": score,
        "risk": "High" if score >= 45 else "Moderate" if score >= 25 else "Low",
        "factors": factors,
        "interventions": ["Bed rails", "Non-slip footwear", "Call bell accessible"] if score >= 25 else []
    }
```

---

## Patient Timeline Analysis
```python
def build_patient_timeline(profile: dict) -> list:
    """Build a chronological timeline of all patient events."""
    events = []

    for dx in profile["records"].get("diagnoses", []):
        events.append({"date": dx.get("diagnosed_at", ""), "type": "DIAGNOSIS",
                       "description": dx["description"], "code": dx.get("icd10_code"), "severity": dx.get("severity")})

    for rx in profile["records"].get("prescriptions", []):
        events.append({"date": rx.get("start_date", ""), "type": "PRESCRIPTION",
                       "description": f"{rx['medication_name']} {rx['dosage']} {rx['frequency']}", "status": rx.get("status")})
        if rx.get("end_date"):
            events.append({"date": rx["end_date"], "type": "PRESCRIPTION_END",
                           "description": f"Stopped: {rx['medication_name']}"})

    for lab in profile["records"].get("lab_reports", []):
        flag = f" [{lab.get('flag', '')}]" if lab.get("flag") and lab["flag"] != "N" else ""
        events.append({"date": lab.get("reported_at", ""), "type": "LAB_RESULT",
                       "description": f"{lab['test_name']}: {lab['value']} {lab.get('unit', '')}{flag}",
                       "abnormal": lab.get("flag") not in ["N", None, ""]})

    events.sort(key=lambda x: x.get("date", ""), reverse=False)
    return events

def generate_timeline_summary(timeline: list) -> str:
    """Generate a narrative clinical summary from patient timeline."""
    if not timeline: return "No clinical events recorded."
    lines = ["**Patient Clinical Timeline**\n"]
    for event in timeline:
        icon = {"DIAGNOSIS": "🔴", "PRESCRIPTION": "💊", "PRESCRIPTION_END": "🚫",
                "LAB_RESULT": "🔬"}.get(event["type"], "📋")
        abnormal = " ⚠️ ABNORMAL" if event.get("abnormal") else ""
        lines.append(f"{icon} **{event.get('date', 'Unknown date')}** — {event['description']}{abnormal}")
    return "\n".join(lines)
```

---

## Medication Tracking & Interaction Check
```python
def track_medications(profile: dict) -> dict:
    """Summarise active medications and flag potential issues."""
    active = [rx for rx in profile["records"].get("prescriptions", []) if rx.get("status") == "active"]
    summary = {
        "active_count": len(active),
        "medications": active,
        "polypharmacy_risk": len(active) >= 5,
        "polypharmacy_note": "5+ medications — review for interactions and deprescribing" if len(active) >= 5 else "OK"
    }
    return summary

def check_drug_allergy_conflict(profile: dict, new_drug: str) -> dict:
    """Check if a new drug conflicts with documented patient allergies."""
    allergies = profile["clinical"].get("allergies", [])
    conflicts = [a for a in allergies if new_drug.lower() in a.lower() or a.lower() in new_drug.lower()]
    return {
        "drug": new_drug,
        "conflicts": conflicts,
        "safe_to_prescribe": len(conflicts) == 0,
        "alert": f"⚠️ ALLERGY ALERT: Patient is allergic to {conflicts}" if conflicts else "No known allergy conflict"
    }
```

---

## Emergency Risk Alerts
```python
def check_critical_lab_values(lab_results: list) -> list:
    """Check for critical (panic) lab values requiring immediate attention."""
    CRITICAL_RANGES = {
        "potassium": {"low": 2.5, "high": 6.5, "unit": "mEq/L"},
        "sodium": {"low": 120, "high": 160, "unit": "mEq/L"},
        "glucose": {"low": 40, "high": 500, "unit": "mg/dL"},
        "hemoglobin": {"low": 6.0, "high": None, "unit": "g/dL"},
        "platelet": {"low": 20, "high": None, "unit": "x10³/μL"},
        "creatinine": {"low": None, "high": 10.0, "unit": "mg/dL"},
        "inr": {"low": None, "high": 5.0, "unit": ""},
        "troponin": {"low": None, "high": 0.04, "unit": "ng/mL"},
    }
    alerts = []
    for lab in lab_results:
        name = lab["test_name"].lower()
        for test, ranges in CRITICAL_RANGES.items():
            if test in name:
                try:
                    val = float(lab["value"])
                    if ranges["low"] and val < ranges["low"]:
                        alerts.append({"test": lab["test_name"], "value": f"{val} {ranges['unit']}",
                                       "alert": "CRITICALLY LOW", "severity": "CRITICAL"})
                    elif ranges["high"] and val > ranges["high"]:
                        alerts.append({"test": lab["test_name"], "value": f"{val} {ranges['unit']}",
                                       "alert": "CRITICALLY HIGH", "severity": "CRITICAL"})
                except (ValueError, TypeError):
                    pass
    return alerts
```

## Output
Save clinical reports as PDF/DOCX to `/workspace/output/clinical/`. Save risk scores and timelines as JSON. Emergency alerts appear inline in the response.
