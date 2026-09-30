# modules/entanglement_engine.py

def calculate_entanglement_map(patient_data, drug_data, organ_failure_risks):
    """
    Calculates a map of "entanglement" scores between a drug and key
    patient bio-nodes (genes, pathways, organs).
    """
    nodes = ["Drug"]
    matrix = []
    
    # --- Key Bio-Nodes ---
    qbs = patient_data.get("quantum_biological_signature", {})
    genomic = patient_data.get("genomic_profile", {})
    mutations = genomic.get("somatic_mutations", [])[:3] # Top 3 mutations
    
    bio_nodes = mutations + list(organ_failure_risks.keys())
    nodes.extend(bio_nodes)
    
    node_map = {name: i for i, name in enumerate(nodes)}
    size = len(nodes)
    matrix = [[0] * size for _ in range(size)]

    # --- Calculate Entanglement Scores ---
    # Drug <-> Gene Entanglement
    classical_match = drug_data.get("performance", {}).get("match_score", 0.7)
    cdr = qbs.get("cellular_decoherence_rate_cdr", 0.05)
    gene_entanglement = classical_match * (1 - (cdr * 5)) # More chaos (CDR) weakens the link

    for gene in mutations:
        if gene in drug_data.get("biomarkers", {}).get("required_mutations", []):
            matrix[node_map["Drug"]][node_map[gene]] = gene_entanglement * 1.5 # Boost for direct targets
            matrix[node_map[gene]][node_map["Drug"]] = gene_entanglement * 1.5
        else:
            matrix[node_map["Drug"]][node_map[gene]] = gene_entanglement
            matrix[node_map[gene]][node_map["Drug"]] = gene_entanglement

    # Drug <-> Organ Entanglement (based on risk)
    for organ, risk_data in organ_failure_risks.items():
        if organ in node_map:
            # Negative entanglement: higher stress means a weaker, more damaging link
            organ_entanglement = 1.0 - risk_data.get("max_stress", 0.5)
            matrix[node_map["Drug"]][node_map[organ]] = organ_entanglement
            matrix[node_map[organ]][node_map["Drug"]] = organ_entanglement
            
    return nodes, matrix