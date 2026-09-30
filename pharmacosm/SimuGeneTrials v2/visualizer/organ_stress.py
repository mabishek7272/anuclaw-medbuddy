# visualizer/organ_stress.py

import numpy as np

def compute_organ_stress(patient_age, organ_profiles, drug_toxicities):
    """
    Simulates organ stress curves over a 30-day period.
    Stress increases with drug toxicity and patient age.
    """
    time_points = np.linspace(0, 30, 100)
    stress_curves = {}
    
    # Age factor: older age increases baseline stress
    age_factor = 1 + (max(0, patient_age - 40) / 50.0) # Increases stress by ~2% per year over 40

    for organ, profile in organ_profiles.items():
        base_stress = (1 - profile.get("baseline_function", 0.9))
        total_damage_potential = 0
        
        for tox_type, sensitivity in profile.get("drug_sensitivity", {}).items():
            if tox_type in drug_toxicities:
                total_damage_potential += drug_toxicities[tox_type] * sensitivity

        # Simulate the stress curve
        peak_stress = base_stress + (total_damage_potential * age_factor * 0.5)
        stress_curve = peak_stress * (1 - np.exp(-time_points / 10)) # Logistic growth
        stress_curves[organ] = np.clip(stress_curve, 0, 1).tolist()
        
    return time_points.tolist(), stress_curves