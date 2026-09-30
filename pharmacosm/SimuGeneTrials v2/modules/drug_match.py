from engine.drug_matcher import match_drugs

def suggest_drugs(patient_genes, drug_db):
    return match_drugs(patient_genes, drug_db)