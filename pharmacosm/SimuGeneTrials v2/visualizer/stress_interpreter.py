def estimate_organ_failure(time_points, stress_curves, threshold=0.8):
    """
    Analyze stress curves to determine potential organ failure risk.
    """
    failure_summary = {}

    for organ, stress_vals in stress_curves.items():
        max_stress = max(stress_vals)
        risk = "Low"
        if max_stress > threshold + 0.1:
            risk = "Severe"
        elif max_stress > threshold:
            risk = "High"
        elif max_stress > 0.5:
            risk = "Moderate"

        failure_summary[organ] = {
            "max_stress": round(max_stress, 3),
            "risk_level": risk
        }

    return failure_summary