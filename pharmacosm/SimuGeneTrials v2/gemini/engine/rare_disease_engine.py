# engine/rare_disease_engine.py

def apply_rare_disease_modifiers(patient_data, drug_data, current_efficacy, current_toxicities, rare_disease_db):
    """
    Applies efficacy and toxicity modifiers based on the patient's rare disease,
    loaded from the main rare_disease_profiles.json database.
    """
    # Check for a specific rare disease field first
    patient_disease_name = patient_data.get("rare_disease")
    
    # If not present, check if the diagnosis contains a known rare disease name
    if not patient_disease_name or patient_disease_name == "None":
        diagnosis_text = patient_data.get("phenotype", {}).get("diagnosis", "")
        for disease in rare_disease_db:
            if disease["disease_name"] in diagnosis_text:
                patient_disease_name = disease["disease_name"]
                break

    if not patient_disease_name or patient_disease_name == "None":
        return current_efficacy, current_toxicities, ["No specific rare disease modifiers applied."]

    # Find the disease profile in our "beast mode" database
    disease_profile = next((d for d in rare_disease_db if d["disease_name"] == patient_disease_name), None)
    
    if not disease_profile:
        return current_efficacy, current_toxicities, [f"Warning: Profile for '{patient_disease_name}' not in DB."]

    notes = [f"Applying modifiers for '{patient_disease_name}':"]
    
    # 1. Modify Efficacy by Drug Class
    drug_class = drug_data.get("mechanism_class")
    if drug_class:
        class_modifiers = disease_profile.get("efficacy_modifiers_by_class", {})
        if drug_class in class_modifiers:
            modifier = class_modifiers[drug_class]
            original_efficacy = current_efficacy
            current_efficacy *= modifier
            notes.append(f"  - Efficacy modifier for '{drug_class}': {original_efficacy:.2f} -> {current_efficacy:.2f} (x{modifier})")

    # 2. Amplify Specific Toxicities
    toxicity_amplifiers = disease_profile.get("toxicity_amplifiers", {})
    for tox_type, amplifier in toxicity_amplifiers.items():
        if tox_type in current_toxicities:
            original_tox = current_toxicities[tox_type]
            current_toxicities[tox_type] *= amplifier
            notes.append(f"  - Toxicity amplifier for '{tox_type}': {original_tox:.2f} -> {current_toxicities[tox_type]:.2f} (x{amplifier})")

    return current_efficacy, current_toxicities, notes