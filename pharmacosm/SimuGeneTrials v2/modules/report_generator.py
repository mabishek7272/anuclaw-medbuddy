# modules/report_generator.py
import json
import datetime

def generate_trial_report(patient_data, drug_data, simulation_result, dose_recommendation, failure_risks):
    """
    Generates a comprehensive trial report in a structured, machine-readable format.
    Includes the personalized dosing recommendation and other advanced metrics.
    """
    report = {
        "report_id": f"SR_{patient_data['id']}_{datetime.date.today()}",
        "timestamp": datetime.datetime.now().isoformat(),
        "summary": {
            "patient_id": patient_data["id"],
            "drug_name": drug_data["drug_name"],
            "predicted_efficacy_percent": simulation_result["predicted_efficacy"],
            "final_outcome": simulation_result["outcome"],
        },
        "dosing_recommendation": dose_recommendation,
        "explainability": {
            "classical_score_contribution": simulation_result.get("components", {}).get("classical_score"),
            "quantum_compatibility_score": simulation_result.get("components", {}).get("quantum_compatibility_score"),
            "genetic_match_modifier": simulation_result.get("components", {}).get("genetic_match_modifier"),
            "notes": "Final efficacy is a weighted blend of a genetically-modified classical score and quantum biological compatibility."
        },
        "risk_assessment": {
            "predicted_side_effects": simulation_result["side_effect_risks"],
            "predicted_organ_failure_risk": failure_risks,
            "organ_impact_scores": simulation_result.get("organ_impact", {})
        },
        "inputs": {
            "patient_phenotype": patient_data["phenotype"],
            "patient_qbs": patient_data["quantum_biological_signature"],
            "drug_mechanism": drug_data["mechanism"]
        }
    }
    return report