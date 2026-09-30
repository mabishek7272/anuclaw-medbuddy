# ANUClaw Regulatory & Compliance Suite

Regulatory compliance workflows for healthcare AI and medical devices: FDA (21 CFR Part 11, Part 820), HIPAA, ISO 13485, IEC 62304, CE marking, audit logging, and clinical study reporting.

## When to Use
- User asks about FDA submissions, GxP compliance, audit trails
- Medical device software development (IEC 62304)
- HIPAA data handling and privacy
- ISO 13485 quality management for medical devices
- Clinical trial reporting (CONSORT, SPIRIT, PRISMA)
- CE marking in the EU (MDR 2017/745)
- Electronic records and signatures (21 CFR Part 11)

## ⚠️ Important
Regulatory guidance from ANUClaw is for research and educational purposes. Engage qualified regulatory affairs professionals for actual submissions.

## Capabilities

### 21 CFR Part 11 — Electronic Records & Signatures
```python
import hashlib
import hmac
import json
from datetime import datetime

class CFRPart11AuditLog:
    """21 CFR Part 11 compliant audit trail for electronic records."""
    
    def __init__(self, db_path="audit_log.db"):
        import sqlite3
        self.conn = sqlite3.connect(db_path)
        self._create_table()
    
    def _create_table(self):
        self.conn.execute("""
        CREATE TABLE IF NOT EXISTS audit_trail (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            user_id TEXT NOT NULL,
            action TEXT NOT NULL,
            record_type TEXT NOT NULL,
            record_id TEXT NOT NULL,
            previous_value TEXT,
            new_value TEXT,
            reason TEXT,
            signature_hash TEXT NOT NULL,
            system_info TEXT
        )
        """)
    
    def log_event(self, user_id, action, record_type, record_id, 
                  previous_value=None, new_value=None, reason=None):
        timestamp = datetime.utcnow().isoformat()
        payload = f"{timestamp}:{user_id}:{action}:{record_id}"
        signature = hmac.new(b"anuclaw-audit-secret", payload.encode(), hashlib.sha256).hexdigest()
        
        self.conn.execute("""
        INSERT INTO audit_trail 
        (timestamp, user_id, action, record_type, record_id, previous_value, new_value, reason, signature_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (timestamp, user_id, action, record_type, record_id,
              str(previous_value), str(new_value), reason, signature))
        self.conn.commit()
```

### HIPAA Compliance Utilities
```python
import re

PHI_PATTERNS = {
    "ssn": re.compile(r'\b\d{3}-\d{2}-\d{4}\b'),
    "mrn": re.compile(r'\bMRN[:\s]*\d{6,10}\b', re.IGNORECASE),
    "dob": re.compile(r'\b(0[1-9]|1[0-2])/(0[1-9]|[12]\d|3[01])/\d{4}\b'),
    "phone": re.compile(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b'),
    "email": re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'),
    "zip": re.compile(r'\b\d{5}(?:-\d{4})?\b'),
    "ip_address": re.compile(r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b'),
}

def detect_phi(text):
    """Detect potential PHI in text."""
    found = {}
    for phi_type, pattern in PHI_PATTERNS.items():
        matches = pattern.findall(text)
        if matches:
            found[phi_type] = matches
    return found

def redact_phi(text):
    """Redact detected PHI from text."""
    redacted = text
    for phi_type, pattern in PHI_PATTERNS.items():
        redacted = pattern.sub(f'[{phi_type.upper()}_REDACTED]', redacted)
    return redacted

def hipaa_risk_assessment(data_handling_description):
    """Generate a HIPAA risk assessment checklist."""
    checklist = {
        "encryption_at_rest": False,
        "encryption_in_transit": False,
        "access_controls": False,
        "audit_logging": False,
        "minimum_necessary": False,
        "baa_in_place": False,
        "breach_notification_plan": False,
    }
    return {"checklist": checklist, "note": "Complete manual review required"}
```

### ISO 13485 / IEC 62304 (Medical Device Software)
```python
def generate_software_risk_assessment(software_name, functions):
    """Generate an IEC 62304 software safety classification template."""
    return {
        "software_name": software_name,
        "iec_62304_safety_class": "To be determined by risk analysis",
        "functions": [
            {
                "function": fn,
                "hazard_identification": "Identify potential hazards",
                "severity": "To be assessed",
                "probability": "To be assessed",
                "risk_level": "To be assessed",
                "mitigation": "To be defined",
            }
            for fn in functions
        ],
        "note": "This template requires review by a qualified medical device regulatory expert",
    }

def generate_udi_label(device_name, manufacturer, manufacture_date, lot_number, expiry_date=None):
    """Generate a UDI (Unique Device Identifier) label template per FDA 21 CFR Part 830."""
    return {
        "device_identifier": f"ANUClaw-DI-{lot_number[:8].upper()}",
        "production_identifier": {
            "lot_number": lot_number,
            "manufacture_date": manufacture_date,
            "expiry_date": expiry_date,
        },
        "device_name": device_name,
        "manufacturer": manufacturer,
        "label_format": "HIBC or GS1 DataMatrix",
    }
```

### Clinical Study Reporting (CONSORT / PRISMA)
```python
def generate_consort_checklist():
    """Generate a CONSORT 2010 reporting checklist for RCTs."""
    return {
        "title_and_abstract": ["Identification as RCT", "Structured summary"],
        "introduction": ["Background and objectives"],
        "methods": {
            "trial_design": ["Description of design", "Changes after trial commencement"],
            "participants": ["Eligibility criteria", "Settings and locations"],
            "interventions": ["Precise details for replication"],
            "outcomes": ["Pre-specified primary and secondary outcomes"],
            "sample_size": ["How determined"],
            "randomisation": ["Sequence generation", "Allocation concealment", "Implementation"],
            "blinding": ["Who was blinded", "How"],
            "statistical_methods": ["For comparing groups", "Subgroup analyses"],
        },
        "results": ["Participant flow diagram", "Baseline data", "Outcomes", "Harms"],
        "discussion": ["Limitations", "Generalisability", "Interpretation"],
        "other": ["Registration", "Protocol", "Funding"],
    }

def generate_prisma_checklist():
    """Generate a PRISMA 2020 reporting checklist for systematic reviews."""
    return {
        "title": ["Systematic review", "Search date"],
        "abstract": ["Background", "Methods", "Results", "Discussion", "Registration"],
        "introduction": ["Rationale", "Objectives"],
        "methods": ["Eligibility criteria", "Information sources", "Search strategy",
                    "Study selection", "Data extraction", "Risk of bias", "Effect measures",
                    "Synthesis methods", "Reporting bias", "Certainty assessment"],
        "results": ["Study selection", "Study characteristics", "Risk of bias",
                    "Results of syntheses", "Certainty of evidence"],
        "discussion": ["Summary", "Limitations", "Conclusions"],
        "other": ["Registration", "Protocol", "Support", "Competing interests", "Availability"],
    }
```

## Regulatory Frameworks Covered
- FDA 21 CFR Part 11 (electronic records)
- FDA 21 CFR Part 820 (QSR for medical devices)
- HIPAA Privacy & Security Rules
- ISO 13485:2016 (medical device QMS)
- IEC 62304:2006+AMD1:2015 (medical device software)
- EU MDR 2017/745 (CE marking)
- ICH E6(R2) GCP (clinical trials)
- CONSORT, PRISMA, SPIRIT (reporting standards)
- ISO 14971 (risk management for medical devices)
