import json
from modules.quantum_predictor import QuantumPredictor
from engine.rare_disease_engine import apply_rare_disease_modifiers

# UPGRADED: Function now requires organ_db
def simulate_trial(patient_id, drug_name, mood_state, patients_db, drugs_db, moods_db, rare_diseases_db, organ_db):
    """
    The core simulation function, now including organ impact calculations.
    """
    patient = next((p for p in patients_db if p["id"] == patient_id), None)
    drug = next((d for d in drugs_db if d["drug_name"] == drug_name), None)
    mood_profile = moods_db.get(mood_state.title(), moods_db["Neutral"])

    if not patient or not drug:
        return {"error": "Invalid patient ID or drug name."}

    # ... (Steps 2, 3, 4 for efficacy and modifiers remain the same) ...
    try:
        predictor = QuantumPredictor(patient, drug)
        prediction_result = predictor.predict_response()
        predicted_efficacy = prediction_result["predicted_efficacy"]
        efficacy_components = prediction_result["components"]
    except ValueError as e:
        return {"error": str(e)}

    side_effect_risks = drug.get("performance", {}).get("toxicity_profile", {}).copy()

    predicted_efficacy += mood_profile["efficacy_boost"] * 100
    for key, multiplier in mood_profile.items():
        if "multiplier" in key:
            for tox_type in side_effect_risks:
                side_effect_risks[tox_type] *= multiplier
    
    predicted_efficacy, side_effect_risks, rare_disease_notes = apply_rare_disease_modifiers(
        patient, drug, predicted_efficacy / 100.0, side_effect_risks, rare_diseases_db
    )
    predicted_efficacy *= 100

    # --- NEW: Step 5: Organ Impact Simulation ---
    organ_impact = {}
    for organ, profile in organ_db.items():
        sensitivity = profile.get("drug_sensitivity", {})
        baseline = profile.get("baseline_function", 1.0)
        total_risk = 0.0
        
        for se, weight in sensitivity.items():
            if se in side_effect_risks:
                total_risk += side_effect_risks[se] * weight
        
        if total_risk > 0:
            organ_impact[organ] = {
                "baseline_function": baseline,
                "predicted_damage_score": round(total_risk, 3)
            }

    # --- Step 6: Finalize and Clamp Values ---
    final_efficacy = round(max(0, min(100, predicted_efficacy)), 2)
    final_toxicities = {k: round(min(v, 1.0), 3) for k, v in side_effect_risks.items()}
    
    outcome = ("Likely Responder" if final_efficacy >= 70 else
               ("Partial Responder" if final_efficacy >= 45 else "Non-Responder"))

    return {
        "patient_id": patient_id, "drug_name": drug_name, "predicted_efficacy": final_efficacy,
        "side_effect_risks": final_toxicities, "outcome": outcome, "mood": mood_state,
        "rare_disease": patient.get("rare_disease", patient.get("phenotype", {}).get("diagnosis")),
        "components": efficacy_components,
        "organ_impact": organ_impact, # RESTORED
        "notes": {"rare_disease_log": rare_disease_notes}
    }