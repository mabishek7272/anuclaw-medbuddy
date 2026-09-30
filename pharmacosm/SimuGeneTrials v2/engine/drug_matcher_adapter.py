# engine/drug_matcher_adapter.py
from engine.drug_matcher import match_drugs

PATHWAY_GENES = {
    "HR":{"BRCA1","BRCA2","RAD51","PALB2","ATM"},
    "MMR":{"MLH1","MSH2","MSH6","PMS2"},
    "NER":{"ERCC1","XPA","XPC"},
    "BER":{"OGG1","TDG","PARP1","PARP2"},
    "NHEJ":{"PRKDC","XRCC5","XRCC6"}
}

def pathway_boost(drug, patient_genes):
    s = PATHWAY_GENES.get((drug.get("repair_type") or "").upper(), set())
    return 0.10 if s.intersection(set(patient_genes or [])) else 0.0

def match_drugs_tolerant(patient_genes, drug_db):
    cand = match_drugs(patient_genes, drug_db)
    # apply gentle boost to borderline candidates
    for c in cand:
        c["efficacy"] = min(0.99, max(0.0, c.get("efficacy",0.7) + pathway_boost(c, patient_genes)))
    return cand