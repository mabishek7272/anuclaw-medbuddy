import streamlit as st
import json
import os
import pandas as pd
import time
import base64
import pyvista as pv
import py3Dmol
from streamlit.components.v1 import html as st_component_html

# --- All Final Modules ---
from simulator import simulate_trial
from modules.report_generator import generate_trial_report
from modules.entanglement_engine import calculate_entanglement_map
from engine.digital_twin import generate_digital_twin
from modules.stress_interpreter import estimate_organ_failure
from modules.pharmacology_engine import analyze_drug_protocol
from modules.similarity_engine import find_similar_patients
from modules.dosing_engine import recommend_dose_adjustment
from modules.pdf_generator import create_report_pdf
from visualizer.timeline import generate_timeline_chart
from visualizer.organ_simulator import simulate_distribution, plot_distribution
from visualizer.organ_stress import compute_organ_stress
from visualizer.entanglement_chart import create_entanglement_chord_diagram

# =========================
# Page Config
# =========================
st.set_page_config(page_title="SimuGene Trials", layout="wide", initial_sidebar_state="expanded")
st.title("🧪 SimuGene Trials")
st.caption("Quantum-Inspired Virtual Clinical Trial Engine – Final Build")

# =========================
# SESSION STATE INITIALIZATION
# =========================
if 'simulation_result' not in st.session_state:
    st.session_state.simulation_result = None
    st.session_state.patient_data = None
    st.session_state.drug_data = None
if 'similar_patients' not in st.session_state:
    st.session_state.similar_patients = None

# =========================
# Data Loading (Cached for performance)
# =========================
DATA_DIR = "data"
@st.cache_data
def load_all_data():
    paths = {
        "patients": os.path.join(DATA_DIR, "virtual_patients.json"),
        "drugs": os.path.join(DATA_DIR, "beast_drug_db.json"),
        "moods": os.path.join(DATA_DIR, "mood_profiles.json"),
        "rare_diseases": os.path.join(DATA_DIR, "rare_disease_profiles.json"),
        "organs": os.path.join(DATA_DIR, "organ_profiles.json"),
        "doses": os.path.join(DATA_DIR, "dose_protocols.json")
    }
    data = {key: json.load(open(path, "r", encoding="utf-8")) for key, path in paths.items()}
    return data

data = load_all_data()

# =========================
# Sidebar Inputs
# =========================
st.sidebar.image("assets/logo.png", width=150) 
st.sidebar.header("📋 Trial Input")
patient_ids = [p["id"] for p in data["patients"]]
drug_names = [d["drug_name"] for d in data["drugs"]]
mood_names = list(data["moods"].keys())

selected_patient_id = st.sidebar.selectbox("👤 Select Patient", patient_ids)
selected_drug_name = st.sidebar.selectbox("💊 Select Drug", drug_names)
selected_mood = st.sidebar.selectbox("🧠 Select Mood", mood_names)

# =========================
# Simulation Trigger
# =========================
if st.sidebar.button("🚀 Run Final Simulation", key="run_sim"):
    with st.spinner("Running quantum-inspired biosimulation..."):
        patient_data = next((p for p in data["patients"] if p["id"] == selected_patient_id), None)
        drug_data = next((d for d in data["drugs"] if d["drug_name"] == selected_drug_name), None)

        # BUG FIX 1: The simulator call now correctly includes all required database arguments
        result = simulate_trial(
            patient_id=selected_patient_id, drug_name=selected_drug_name, mood_state=selected_mood,
            patients_db=data["patients"], drugs_db=data["drugs"],
            moods_db=data["moods"], rare_diseases_db=data["rare_diseases"],
            organ_db=data["organs"]
        )
        
        if "error" not in result:
            st.session_state.simulation_result = result
            st.session_state.patient_data = patient_data
            st.session_state.drug_data = drug_data
            st.session_state.similar_patients = None 
        else:
            st.session_state.simulation_result = None
            st.error(f"Simulation Error: {result['error']}")

# =========================
# Main UI Display (driven by session state)
# =========================
if st.session_state.simulation_result:
    result = st.session_state.simulation_result
    patient_data = st.session_state.patient_data
    drug_data = st.session_state.drug_data
    
    st.success(f"✅ Displaying Simulation Results for Patient {result['patient_id']}")
    
    age = patient_data.get("phenotype", {}).get("age", 45)
    time_points_stress, stress_curves = compute_organ_stress(
        patient_age=age, organ_profiles=data["organs"], drug_toxicities=result.get("side_effect_risks", {})
    )
    failure_risks = estimate_organ_failure(time_points_stress, stress_curves)
    entanglement_nodes, entanglement_matrix = calculate_entanglement_map(patient_data, drug_data, failure_risks)
    dose_recommendation = recommend_dose_adjustment(patient_data, drug_data)
    
    tab1, tab2, tab3, tab4, tab5 = st.tabs(["📊 Outcome", "💊 Dosing & Regimen", "⚠️ Risk Analysis", "⚛️ Entanglement Map", " BIO TWIN 3D"])

    with tab1:
        col1, col2 = st.columns([2, 3])
        with col1:
            st.markdown("### 🧪 Trial Outcome")
            st.metric("Predicted Efficacy", f"{result['predicted_efficacy']:.2f}%")
            st.metric("Final Outcome", result["outcome"])
            st.divider()
            st.markdown("### ⚛️ Quantum Prediction Breakdown")
            components = result.get("components", {})
            classical_score = components.get("classical_score", 0) * 100
            quantum_score = components.get("quantum_compatibility_score", 0) * 100
            genetic_match = components.get("genetic_match_modifier", 0) * 100
            st.metric("Genetic Match Modifier", f"{genetic_match:.1f}%")
            c1_sub, c2_sub = st.columns(2)
            c1_sub.metric("Classical Score", f"{classical_score:.1f}%")
            c2_sub.metric("Quantum Compatibility", f"{quantum_score:.1f}%")
        with col2:
            st.markdown("### 🧬 Patient Digital Twin")
            st.json(generate_digital_twin(patient_data))
            st.markdown("### 👥 Patient Similarity Engine")
            if st.button("Find Similar Patients"):
                with st.spinner("Calculating similarity scores..."):
                    st.session_state.similar_patients = find_similar_patients(patient_data["id"], data["patients"])
            if st.session_state.similar_patients is not None:
                st.dataframe(pd.DataFrame(st.session_state.similar_patients).head(3))
                
    with tab2:
        st.markdown("### 💊 Personalized Dosing Recommendation")
        if "error" in dose_recommendation:
            st.error(dose_recommendation["error"])
        else:
            c1, c2 = st.columns(2)
            c1.metric("Standard Dose", f"{dose_recommendation['standard_dose_mg']} mg")
            c2.metric("AI Recommended Dose", f"{dose_recommendation['recommended_dose_mg']} mg", 
                        delta=f"{(dose_recommendation['adjustment_factor']-1)*100:.0f}% Adjustment")
            st.markdown("#### Justification:")
            for reason in dose_recommendation["reasons"]:
                st.info(f"📄 {reason}")

    with tab3:
        col1, col2 = st.columns(2)
        with col1:
            st.markdown("### 📉 Side Effect Timeline")
            fig_timeline = generate_timeline_chart(result.get("side_effect_risks", {}))
            st.plotly_chart(fig_timeline, use_container_width=True)
            st.markdown("### ⚠️ Predicted Side Effect Risks")
            st.dataframe(pd.DataFrame(result.get("side_effect_risks", {}).items(), columns=['Side Effect', 'Risk Score']))
        with col2:
            st.markdown("### 🧬 Organ Drug Distribution")
            time_points_dist, organ_curves = simulate_distribution(dose_mg=100)
            fig_dist = plot_distribution(time_points_dist, organ_curves)
            st.plotly_chart(fig_dist, use_container_width=True)
            st.divider()
            st.markdown("### ⚡ Organ Stress Curves")
            for organ in failure_risks.keys():
                df = pd.DataFrame({f"{organ}": stress_curves.get(organ, [])}, index=time_points_stress)
                st.line_chart(df)
            st.markdown("### 🚨 Organ Failure Risk Summary")
            st.json(failure_risks)

    with tab4:
        st.markdown("### ✨ Quantum Entanglement Map")
        st.info("This map shows the strength of interaction between the drug and key bio-nodes. Thicker lines indicate stronger entanglement.")
        fig_entanglement = create_entanglement_chord_diagram(entanglement_nodes, entanglement_matrix)
        st.plotly_chart(fig_entanglement, use_container_width=True)
    
    with tab5:
        st.markdown("### 🧬 Interactive Bio-Twin Diagnostic Suite")
        view_mode = st.radio("Select View Mode", ["Full Body Bio-Twin", "Organ Inspector"], horizontal=True)
        
        # BUG FIX 2: Corrected Python boolean from 'true' to 'True'
        def show_3d_model(model_path, color='white', spin=True):
            try:
                with open(model_path, "rb") as f:
                    data = base64.b64encode(f.read()).decode("utf-8")
                viewer = py3Dmol.view(width=800, height=550)
                viewer.addModel(data, "glb")
                viewer.setStyle({'surface': {'color': color, 'opacity': 0.9}})
                if spin:
                    viewer.spin("y")
                viewer.zoomTo()
                st_component_html(str(viewer.getvalue()), height=550)
            except FileNotFoundError:
                st.error(f"3D model not found! Ensure '{model_path}' exists.")
        
        st.divider()
        if view_mode == "Full Body Bio-Twin":
            patient_sex = patient_data.get("phenotype", {}).get("sex", "Female").lower()
            model_file = f"assets/{patient_sex}.glb"
            show_3d_model(model_file, color='#ADD8E6', spin=True)
        else: # Organ Inspector
            col1, col2 = st.columns([1,2])
            with col1:
                st.info("Select an organ to inspect its 3D model, color-coded by simulated risk level.")
                organ_list = ["Brain", "Heart", "Kidney", "Liver"]
                selected_organ = st.selectbox("Select Organ", organ_list)
                if selected_organ:
                    organ_risk = failure_risks.get(selected_organ, {"max_stress": 0, "risk_level": "Low"})
                    risk_level = organ_risk.get("risk_level", "Low")
                    risk_color_map = {"Low": "green", "Moderate": "yellow", "High": "orange", "Severe": "red"}
                    display_color = risk_color_map.get(risk_level, "grey")
                    st.metric("Risk Level", risk_level)
                    st.metric("Max Stress Score", f"{organ_risk.get('max_stress', 0):.3f}")
                    st.markdown(f"<hr style='border: 2px solid {display_color};' />", unsafe_allow_html=True)
            with col2:
                if selected_organ:
                    model_file = f"assets/{selected_organ.lower()}.glb"
                    show_3d_model(model_file, color=display_color)

    st.divider()
    st.markdown("### 📄 Download Full Report")
    report_data = generate_trial_report(patient_data, drug_data, result, dose_recommendation, failure_risks)
    pdf_bytes = create_report_pdf(report_data)
    c1_dl, c2_dl = st.columns(2)
    c1_dl.download_button(label="⬇️ Download PDF Report", data=pdf_bytes,
        file_name=f"SimuGene_Report_{selected_patient_id}_{selected_drug_name}.pdf", mime="application/pdf")
    c2_dl.download_button(label="⬇️ Download Raw Data (JSON)", data=json.dumps(report_data, indent=2),
        file_name=f"SimuGene_Data_{selected_patient_id}_{selected_drug_name}.json", mime="application/json")

else:
    st.info("Select parameters from the sidebar and click 'Run Final Simulation' to begin.")

st.divider()
with st.expander("💊 Multi-Drug Interaction Simulator"):
    selected_combo = st.multiselect("Select multiple drugs to combine", drug_names)
    if st.button("Analyze Combination"):
        if len(selected_combo) > 1:
            combo_result = analyze_drug_protocol(selected_combo, data["drugs"])
            st.metric("Estimated Combined Efficacy", f"{combo_result.get('estimated_efficacy', 0) * 100:.2f}%")
            st.markdown("#### Interaction Notes:")
            for note in combo_result.get("interaction_notes", []):
                st.success(f"✅ {note}") if "SYNERGY" in note else st.warning(f"⚠️ {note}")
            st.markdown("#### Combined Side Effect Profile:")
            st.json(combo_result.get("combined_toxicity_profile", {}))
        else:
            st.warning("Please select at least two drugs to analyze.")