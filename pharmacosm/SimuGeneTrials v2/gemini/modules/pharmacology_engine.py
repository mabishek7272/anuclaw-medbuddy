# modules/pharmacology_engine.py

def analyze_drug_protocol(drug_names, drug_db):
    """
    Analyzes a combination of drugs for synergy, antagonism, and toxicity profile.
    This is the upgraded "beast mode" replacement for the old drug_matcher.
    """
    protocol_drugs_full = [d for d in drug_db if d["drug_name"] in drug_names]
    if not protocol_drugs_full:
        return {"error": "No valid drugs found in protocol."}
        
    # We need the flattened, simpler data for this analysis
    protocol_drugs = []
    for d_full in protocol_drugs_full:
        perf = d_full.get("performance", {})
        eff_range = perf.get("efficacy_range", [0.6, 0.8])
        base_eff = (eff_range[0] + eff_range[1]) / 2.0
        
        flat = {
            "drug_name": d_full.get("drug_name"),
            "mechanism": d_full.get("mechanism"),
            "efficacy": base_eff,
            "toxicity_profile": perf.get("toxicity_profile", {})
        }
        protocol_drugs.append(flat)


    # --- Efficacy Analysis (Synergy & Antagonism) ---
    final_efficacy = 0
    total_base_efficacy = sum(d["efficacy"] for d in protocol_drugs)
    
    interaction_notes = []
    mechanisms = {d["mechanism"] for d in protocol_drugs}
    
    # Synergy model: hitting different mechanisms is beneficial
    if len(mechanisms) > 1 and len(protocol_drugs) > 1:
        synergy_bonus = 0.15 * (len(mechanisms) -1) # More unique mechs, more bonus
        final_efficacy = (total_base_efficacy / len(protocol_drugs)) + synergy_bonus
        interaction_notes.append(f"✅ SYNERGY DETECTED: Multiple mechanisms of action. Applying +{synergy_bonus*100:.0f}% efficacy bonus.")
    else:
        # If single mechanism, average the efficacy
        final_efficacy = total_base_efficacy / len(protocol_drugs)

    # --- Toxicity Analysis ---
    combined_toxicities = {}
    for drug in protocol_drugs:
        for tox_type, value in drug.get("toxicity_profile", {}).items():
            combined_toxicities[tox_type] = combined_toxicities.get(tox_type, 0) + value
    
    # Check for overlapping high-risk toxicities
    for tox_type, value in combined_toxicities.items():
        if value > 0.8: # Arbitrary threshold for high-risk overlap
            interaction_notes.append(f"⚠️ WARNING: High toxicity overlap for '{tox_type}' (Score: {value:.2f}).")

    return {
        "estimated_efficacy": round(min(1.0, final_efficacy), 3),
        "combined_toxicity_profile": {k: round(v, 3) for k, v in combined_toxicities.items()},
        "interaction_notes": interaction_notes
    }