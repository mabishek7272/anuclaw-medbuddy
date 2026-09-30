def simulate_combination(drugs_list, drug_db):
    combined_effect = 0
    interaction_notes = []
    combined_side_effects = {}

    seen_targets = set()

    for name in drugs_list:
        drug = next((d for d in drug_db if d["drug_name"] == name), None)
        if not drug:
            continue

        combined_effect += drug.get("efficacy", 0)
        for gene in drug.get("target_genes", []):
            if gene in seen_targets:
                interaction_notes.append(f"⚠️ Target overlap: {gene} between drugs")
            seen_targets.add(gene)

        for k, v in drug.get("toxicity_profile", {}).items():
            combined_side_effects[k] = combined_side_effects.get(k, 0) + v

    combined_effect = round(min(combined_effect / len(drugs_list), 1.0), 2)
    combined_side_effects = {k: round(min(v, 1.0), 3) for k, v in combined_side_effects.items()}

    return {
        "combined_efficacy_estimate": combined_effect,
        "interaction_notes": interaction_notes,
        "side_effect_risk_profile": combined_side_effects
    }