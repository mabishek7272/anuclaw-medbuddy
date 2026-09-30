from modules.rare_hooks import apply_rare_modifiers

predicted_efficacy, side_effect_risks = apply_rare_modifiers(
    patient_data, drug, predicted_efficacy, side_effect_risks
)