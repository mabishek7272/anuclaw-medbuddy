# ANUClaw Clinical & Medical Suite

Clinical medicine workflows: literature search, clinical decision support, patient document simplification, USMLE prep, FHIR/EHR, medical entity extraction, specialty briefs.

## When to Use
- User asks about symptoms, diagnoses, medications, lab values
- PubMed or clinical literature search
- Patient letters, discharge summaries, prescriptions (simplification)
- ClinicalTrials.gov queries
- USMLE preparation
- FHIR/HL7 data parsing
- Medical imaging analysis

## ⚠️ Disclaimer
ANUClaw is NOT a clinical decision-making system. Outputs are for research and educational purposes only. Always recommend professional medical consultation.

## Capabilities

### PubMed Literature Search
```python
from Bio import Entrez
Entrez.email = "anuclaw@research.ai"

def pubmed_search(query, max_results=10):
    handle = Entrez.esearch(db="pubmed", term=query, retmax=max_results, sort="relevance")
    record = Entrez.read(handle)
    ids = record["IdList"]

    handle2 = Entrez.efetch(db="pubmed", id=ids, rettype="abstract", retmode="text")
    abstracts = handle2.read()
    return abstracts

results = pubmed_search("CRISPR cancer immunotherapy 2024[dp]")
print(results)
```

### ClinicalTrials.gov Query
```python
import requests

def search_clinical_trials(condition, status="RECRUITING", max_results=10):
    url = "https://clinicaltrials.gov/api/v2/studies"
    params = {
        "query.cond": condition,
        "filter.overallStatus": status,
        "pageSize": max_results,
        "format": "json",
    }
    res = requests.get(url, params=params)
    data = res.json()
    trials = []
    for study in data.get("studies", []):
        proto = study.get("protocolSection", {})
        id_mod = proto.get("identificationModule", {})
        trials.append({
            "nct_id": id_mod.get("nctId"),
            "title": id_mod.get("briefTitle"),
            "phase": proto.get("designModule", {}).get("phases", []),
            "status": proto.get("statusModule", {}).get("overallStatus"),
        })
    return trials
```

### Medical Entity Extraction
```python
import spacy

# Load a clinical NLP model (en_core_sci_lg or similar)
# pip install scispacy && python -m spacy download en_core_sci_lg
def extract_medical_entities(text):
    """Extract symptoms, medications, diagnoses, lab values from clinical text."""
    import re
    entities = {
        "symptoms": [],
        "medications": [],
        "lab_values": [],
        "diagnoses": [],
    }
    
    # Simple rule-based extraction (replace with scispacy for production)
    lab_pattern = re.compile(r'\b([A-Z][a-z]+\s)?(?:level|count|ratio):\s*([\d.]+)\s*([a-zA-Z/%]+)?', re.IGNORECASE)
    for match in lab_pattern.finditer(text):
        entities["lab_values"].append(match.group(0))
    
    return entities
```

### Patient Document Simplification
```python
def simplify_medical_document(document_text, reading_level="8th grade"):
    """
    Ask the Claude agent to simplify this text.
    The agent will rewrite medical jargon into plain language.
    """
    prompt = f"""Please simplify the following medical document for a patient with a {reading_level} reading level.
    
Replace all medical jargon with everyday words. Explain what tests mean, what medications do, and what the patient needs to do next.

Document:
{document_text}

Simplified version:"""
    return prompt  # Return as prompt for the agent to complete
```

### FHIR Resource Parsing
```python
from fhir.resources.patient import Patient
from fhir.resources.observation import Observation
from fhir.resources.medicationrequest import MedicationRequest
import json

def parse_fhir_patient(fhir_json):
    patient = Patient.parse_raw(json.dumps(fhir_json))
    return {
        "id": patient.id,
        "name": str(patient.name[0].text if patient.name else "Unknown"),
        "dob": str(patient.birthDate) if patient.birthDate else None,
        "gender": patient.gender,
    }

def parse_fhir_observation(fhir_json):
    obs = Observation.parse_raw(json.dumps(fhir_json))
    return {
        "code": obs.code.coding[0].display if obs.code.coding else None,
        "value": obs.valueQuantity.value if obs.valueQuantity else None,
        "unit": obs.valueQuantity.unit if obs.valueQuantity else None,
        "effective_date": str(obs.effectiveDateTime) if obs.effectiveDateTime else None,
    }
```

### USMLE Study Support
```python
def usmle_concept_explanation(topic, step="Step1"):
    """Generate a structured USMLE concept explanation."""
    return f"""
# {topic} — USMLE {step} Review

## High-Yield Points
[Agent will fill in based on USMLE content outline]

## Pathophysiology
[Mechanism explanation]

## Classic Presentation
[Signs, symptoms, buzzwords]

## Diagnosis
[Tests, findings]

## Treatment
[First-line, second-line]

## Mnemonics
[Memory aids]
"""

def track_weak_areas(performance_data):
    """Analyse USMLE practice question performance to identify weak areas."""
    weak = {topic: score for topic, score in performance_data.items() if score < 0.6}
    return sorted(weak.items(), key=lambda x: x[1])
```

### Medical Specialty Research Briefs
```python
def generate_specialty_brief(specialty, date_range="last 30 days"):
    """
    Generate a research brief for a medical specialty.
    Searches PubMed, bioRxiv, and top journals.
    """
    queries = {
        "cardiology": "cardiology[mesh] OR myocardial infarction OR heart failure",
        "oncology": "cancer[mesh] OR tumor immunotherapy OR checkpoint inhibitor",
        "neurology": "neurology[mesh] OR Alzheimer disease OR multiple sclerosis",
        "infectious_disease": "infectious disease[mesh] OR COVID-19 OR antimicrobial resistance",
    }
    query = queries.get(specialty.lower(), specialty)
    return pubmed_search(f"({query}) AND {date_range}[dp]", max_results=20)
```

## Databases
- PubMed / NCBI Entrez
- ClinicalTrials.gov
- OpenFDA (drug labels, adverse events)
- OMIM (genetic diseases)
- KEGG Disease
- Disease Ontology
- ICD-10 / SNOMED CT (via FHIR)
