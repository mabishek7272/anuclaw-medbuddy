# modules/similarity_engine.py
import numpy as np

# NOTE: The incorrect line "from modules.similarity_engine import find_similar_patients" has been removed.

def jaccard_similarity(set1, set2):
    """Calculates Jaccard similarity between two sets."""
    intersection = len(set1.intersection(set2))
    union = len(set1.union(set2))
    return intersection / union if union != 0 else 0

def calculate_similarity(target_patient, other_patient):
    """Calculates a weighted similarity score between two patients."""
    
    # 1. Genomic Similarity (Jaccard on mutations)
    target_genes = set(target_patient.get("genomic_profile", {}).get("somatic_mutations", []))
    other_genes = set(other_patient.get("genomic_profile", {}).get("somatic_mutations", []))
    genomic_score = jaccard_similarity(target_genes, other_genes)

    # 2. Phenotypic Similarity (Age difference)
    target_age = target_patient.get("phenotype", {}).get("age", 50)
    other_age = other_patient.get("phenotype", {}).get("age", 50)
    age_diff = abs(target_age - other_age)
    pheno_score = np.exp(-0.05 * age_diff) # Exponential decay for age difference

    # 3. Quantum Similarity (Euclidean distance of QBS vectors)
    qbs_target = target_patient.get("quantum_biological_signature", {})
    qbs_other = other_patient.get("quantum_biological_signature", {})
    
    qbs_keys = ['cellular_decoherence_rate_cdr', 'neural_coherence_score', 'metabolic_spin_polarization']
    qbs_vec_target = np.array([qbs_target.get(key, 0) for key in qbs_keys])
    qbs_vec_other = np.array([qbs_other.get(key, 0) for key in qbs_keys])
    
    qbs_dist = np.linalg.norm(qbs_vec_target - qbs_vec_other) / 2.0 
    qbs_score = 1 - np.clip(qbs_dist, 0, 1)

    # 4. Weighted Final Score
    weights = {"genomic": 0.4, "phenotypic": 0.2, "quantum": 0.4}
    total_score = (weights["genomic"] * genomic_score +
                   weights["phenotypic"] * pheno_score +
                   weights["quantum"] * qbs_score)
                   
    return round(total_score, 4)

def find_similar_patients(target_patient_id, patients_db):
    """Finds and ranks the most similar patients to the target."""
    
    target_patient = next((p for p in patients_db if p["id"] == target_patient_id), None)
    if not target_patient:
        return []

    scores = []
    for patient in patients_db:
        if patient["id"] != target_patient_id:
            score = calculate_similarity(target_patient, patient)
            
            history = patient.get("treatment_history", [])
            last_outcome = history[-1]["outcome"] if history else "No History"
            
            scores.append({
                "id": patient["id"],
                "similarity_score": score,
                "outcome": last_outcome,
                "diagnosis": patient.get("phenotype", {}).get("diagnosis", "N/A")
            })
            
    # Sort by similarity score in descending order
    return sorted(scores, key=lambda x: x["similarity_score"], reverse=True)