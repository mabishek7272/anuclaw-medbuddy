# ANUClaw Medical NLP & Coding

Medical natural language processing, ICD-10/SNOMED CT coding, clinical named entity recognition, medical knowledge graphs, and biomedical text mining.

## When to Use
- Extract diagnoses, medications, symptoms from clinical notes
- Map clinical text to ICD-10 or SNOMED CT codes
- Build or query a medical knowledge graph
- Parse discharge summaries, clinical letters, EMR free-text
- Medical entity linking to biomedical ontologies

---

## Medical NLP — Clinical Named Entity Recognition
```python
import re
from typing import List, Dict

# Using scispacy / medspacy for production clinical NLP
# pip install scispacy medspacy
# python -m spacy download en_core_sci_lg

def extract_clinical_entities(text: str) -> Dict[str, List[str]]:
    """
    Extract medical entities from clinical text.
    Categories: diagnoses, medications, symptoms, procedures, lab_values, anatomy
    """
    try:
        import spacy
        import medspacy
        nlp = medspacy.load()
        doc = nlp(text)
        entities = {"diagnoses": [], "medications": [], "symptoms": [],
                    "procedures": [], "lab_values": [], "anatomy": [], "negated": []}
        for ent in doc.ents:
            label = ent.label_.lower()
            is_negated = hasattr(ent._, 'is_negated') and ent._.is_negated
            if is_negated:
                entities["negated"].append({"text": ent.text, "type": label})
            elif "disease" in label or "condition" in label:
                entities["diagnoses"].append(ent.text)
            elif "drug" in label or "medication" in label or "chemical" in label:
                entities["medications"].append(ent.text)
            elif "symptom" in label or "sign" in label:
                entities["symptoms"].append(ent.text)
            elif "procedure" in label:
                entities["procedures"].append(ent.text)
            elif "anatomy" in label or "body" in label:
                entities["anatomy"].append(ent.text)
        return entities
    except ImportError:
        return _rule_based_extraction(text)

def _rule_based_extraction(text: str) -> Dict[str, List[str]]:
    """Fallback rule-based extraction when scispacy not available."""
    entities = {"diagnoses": [], "medications": [], "symptoms": [], "lab_values": []}
    lab_pattern = re.compile(r'\b(\w[\w\s]*?)(?:level|count|titre)?:\s*([\d.]+)\s*([a-zA-Z/%]+)', re.IGNORECASE)
    for m in lab_pattern.finditer(text):
        entities["lab_values"].append(f"{m.group(1).strip()}: {m.group(2)} {m.group(3)}")
    return entities
```

---

## ICD-10 Coding
```python
import requests

def search_icd10_codes(term: str, language: str = "en") -> List[Dict]:
    """Search ICD-10-CM codes using WHO API."""
    token_url = "https://icdaccessmanagement.who.int/connect/token"
    api_url = "https://id.who.int/icd/entity/search"
    
    # WHO ICD API (register at https://icd.who.int/icdapi)
    # For demo: use NIH NLM API (no auth required)
    nlm_url = "https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search"
    params = {"sf": "code,name", "terms": term, "maxList": 10}
    res = requests.get(nlm_url, params=params)
    data = res.json()
    results = []
    if len(data) > 3 and data[3]:
        for item in data[3]:
            results.append({"code": item[0], "description": item[1]})
    return results

def get_icd10_details(code: str) -> Dict:
    """Get full details for an ICD-10 code."""
    url = f"https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search"
    res = requests.get(url, params={"sf": "code,name", "terms": code})
    return res.json()

def map_text_to_icd10(clinical_text: str) -> List[Dict]:
    """Map free clinical text to the most relevant ICD-10 codes."""
    entities = _rule_based_extraction(clinical_text)
    mappings = []
    all_terms = entities.get("diagnoses", []) + entities.get("symptoms", [])
    for term in all_terms[:5]:
        codes = search_icd10_codes(term)
        if codes:
            mappings.append({"term": term, "top_icd10": codes[0]})
    return mappings
```

---

## SNOMED CT Coding
```python
def search_snomed(term: str) -> List[Dict]:
    """Search SNOMED CT concepts via SNOMED International browser API."""
    url = "https://browser.ihtsdotools.org/snowstorm/snomed-ct/browser/MAIN/descriptions"
    params = {"term": term, "active": True, "limit": 10}
    try:
        res = requests.get(url, params=params, timeout=10)
        data = res.json()
        results = []
        for item in data.get("items", []):
            results.append({
                "concept_id": item.get("concept", {}).get("conceptId"),
                "fsn": item.get("concept", {}).get("fsn", {}).get("term"),
                "preferred_term": item.get("term"),
                "semantic_tag": item.get("concept", {}).get("fsn", {}).get("term", "").split("(")[-1].rstrip(")"),
            })
        return results
    except Exception as e:
        return [{"error": str(e), "note": "SNOMED CT browser API unreachable"}]

def get_snomed_hierarchy(concept_id: str) -> Dict:
    """Get parent and child concepts for a SNOMED CT concept."""
    url = f"https://browser.ihtsdotools.org/snowstorm/snomed-ct/browser/MAIN/{concept_id}/ancestors"
    try:
        res = requests.get(url, timeout=10)
        return res.json()
    except Exception as e:
        return {"error": str(e)}
```

---

## Medical Knowledge Graph
```python
def build_patient_knowledge_graph(profile: dict) -> dict:
    """
    Build a medical knowledge graph for a patient.
    Nodes: Patient, Diagnoses, Medications, Lab Results, Procedures
    Edges: HAS_DIAGNOSIS, PRESCRIBED, HAS_LAB_RESULT, UNDERWENT, TREATS, INTERACTS_WITH
    """
    nodes = [{"id": profile["uid"], "type": "Patient", "label": f"{profile['demographics']['first_name']} {profile['demographics']['last_name']}"}]
    edges = []

    for dx in profile["records"].get("diagnoses", []):
        node_id = f"dx_{dx['id']}"
        nodes.append({"id": node_id, "type": "Diagnosis", "label": dx["description"], "icd10": dx.get("icd10_code")})
        edges.append({"from": profile["uid"], "to": node_id, "relation": "HAS_DIAGNOSIS"})

    for rx in profile["records"].get("prescriptions", []):
        node_id = f"rx_{rx['id']}"
        nodes.append({"id": node_id, "type": "Medication", "label": rx["medication_name"], "dosage": rx["dosage"]})
        edges.append({"from": profile["uid"], "to": node_id, "relation": "PRESCRIBED"})

    for lab in profile["records"].get("lab_reports", []):
        node_id = f"lab_{lab['id']}"
        nodes.append({"id": node_id, "type": "LabResult", "label": lab["test_name"], "value": f"{lab['value']} {lab.get('unit', '')}"})
        edges.append({"from": profile["uid"], "to": node_id, "relation": "HAS_LAB_RESULT"})

    return {"nodes": nodes, "edges": edges, "node_count": len(nodes), "edge_count": len(edges)}

def export_knowledge_graph_cypher(graph: dict) -> str:
    """Export knowledge graph as Neo4j Cypher CREATE statements."""
    cypher = []
    for node in graph["nodes"]:
        props = {k: v for k, v in node.items() if k not in ["id", "type"]}
        prop_str = ", ".join([f'{k}: "{v}"' for k, v in props.items() if v])
        cypher.append(f'CREATE (n_{node["id"].replace("-","_")}:{node["type"]} {{id: "{node["id"]}", {prop_str}}})')
    for edge in graph["edges"]:
        from_id = edge["from"].replace("-", "_")
        to_id = edge["to"].replace("-", "_")
        cypher.append(f'CREATE (n_{from_id})-[:{edge["relation"]}]->(n_{to_id})')
    return "\n".join(cypher)
```

## Output
Save extracted entities as JSON, ICD-10/SNOMED mappings as CSV, knowledge graphs as JSON/Cypher to `/workspace/output/nlp/`.
