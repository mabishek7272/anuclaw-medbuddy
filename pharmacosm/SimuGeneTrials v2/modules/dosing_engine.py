# modules/dosing_engine.py

def recommend_dose_adjustment(patient_data, drug_data):
    """
    Recommends a drug dose adjustment based on patient organ health,
    age, and the drug's pharmacokinetic profile.
    """
    adjustment_factor = 1.0  # Start with 100% of standard dose
    reasons = []

    # --- Key Patient & Drug Data ---
    organ_health = patient_data.get("organ_health_baseline", {})
    patient_age = patient_data.get("phenotype", {}).get("age", 50)
    drug_pk = drug_data.get("pharmacokinetics", {})
    standard_dose = drug_data.get("standard_dose_mg", None)

    if standard_dose is None:
        return {"error": "Standard dose not defined for this drug."}

    # --- Rule 1: Kidney Function ---
    kidney_health = organ_health.get("Kidney", 1.0)
    if kidney_health < 0.75:
        adjustment_factor *= 0.80  # Reduce dose by 20% for poor kidney function
        reasons.append(f"Reduced by 20% due to suboptimal kidney health ({kidney_health:.2f}).")

    # --- Rule 2: Liver Function & Drug Metabolism ---
    liver_health = organ_health.get("Liver", 1.0)
    if "CYP3A4" in drug_pk.get("metabolism", "") and liver_health < 0.8:
        adjustment_factor *= 0.75  # Reduce dose by 25% if metabolized by a weak liver
        reasons.append(f"Reduced by 25% due to poor liver health ({liver_health:.2f}) and CYP3A4 metabolism.")
        
    # --- Rule 3: Geriatric Adjustment ---
    if patient_age > 70:
        adjustment_factor *= 0.95 # Gentle 5% reduction for older patients
        reasons.append(f"Reduced by 5% for geriatric consideration (Age: {patient_age}).")
        
    if not reasons:
        reasons.append("No patient-specific adjustments required. Standard dose recommended.")

    recommended_dose = round(standard_dose * adjustment_factor)

    return {
        "standard_dose_mg": standard_dose,
        "recommended_dose_mg": recommended_dose,
        "adjustment_factor": round(adjustment_factor, 2),
        "reasons": reasons
    }