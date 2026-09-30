def generate_digital_twin(patient):
    return {
        "id": patient["id"],
        "genotype": patient.get("genotype", []),
        "phenotype": patient.get("phenotype", ""),
        "organ_health": {
            "liver": 0.85,
            "heart": 0.92,
            "kidney": 0.88
        }
    }