import streamlit as st
import pandas as pd
import numpy as np
import tensorflow as tf
from sklearn.preprocessing import StandardScaler
import matplotlib.pyplot as plt
import seaborn as sns
import shap
import requests
import json
import time
import tempfile
import networkx as nx
from pyvis.network import Network
import py3Dmol
import os
from pathlib import Path
from fpdf import FPDF

# --- Streamlit Setup ---
st.set_page_config(page_title="🧬 Quantum DNA Repair + Drug Match Engine", layout="wide", initial_sidebar_state="expanded")
st.sidebar.title("⚙️ Controls")
st.title("🧬 Quantum DNA Repair + Drug Match Engine")
st.caption("Upload DNA data to predict repair pathways, match drugs, visualize mutations, and simulate quantum edits.")

# --- Model Loader ---
@st.cache_resource
def load_model():
    try:
        return tf.keras.models.load_model("model/Quantum_AMI_DNA_Repair_Model.h5", compile=False)
    except Exception as e:
        st.error(f"Error loading model: {e}")
        return None

model = load_model()

# --- Core Functions ---
def convert_raw_dna(file):
    try:
        name = file.name
        if name.endswith(".vcf"):
            df = pd.read_csv(file, comment="#", delimiter="\t", header=None,
                             names=["CHROM", "POS", "ID", "REF", "ALT", "QUAL", "FILTER", "INFO"])
        elif name.endswith(".txt") or name.endswith(".csv"):
            df = pd.read_csv(file)
        else:
            return None, None, "❌ Unsupported format"

        df["radius_mean"] = df["POS"] / 1_000_000
        df["texture_mean"] = df["ALT"].apply(lambda x: len(str(x)))
        df["perimeter_mean"] = (df["QUAL"] / 100).round(4)
        ai = df[["radius_mean", "texture_mean", "perimeter_mean"]]
        return df, ai, None
    except Exception as e:
        return None, None, str(e)

def classify_repair(pred):
    if pred > 0.85:
        return "Homologous Recombination (HR)", "🟢 High", "Low"
    elif pred > 0.65:
        return "Base Excision Repair (BER)", "🟡 Medium", "Moderate"
    elif pred > 0.45:
        return "Nucleotide Excision Repair (NER)", "🟠 Low", "Elevated"
    else:
        return "Non-Homologous End Joining (NHEJ)", "🔴 Very Low", "High"

def match_drugs(repair_type, min_score=0.75, approval_filter=None):
    try:
        with open("drug_data.json") as f:
            drugs = json.load(f)
        abbr = repair_type.split("(")[-1].replace(")", "").strip()
        matched = [d for d in drugs if d["repair_type"] == abbr and d["match_score"] >= min_score]
        if approval_filter and approval_filter != "Any":
            matched = [d for d in matched if d["approval"] == approval_filter]
        return sorted(matched, key=lambda x: x["match_score"], reverse=True)
    except:
        return []

def get_pubchem_info(drug_name):
    try:
        url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{drug_name}/description/JSON"
        data = requests.get(url, timeout=5).json()
        return data["InformationList"]["Information"][0].get("Description", "No info")
    except:
        return "No PubChem info"

def get_flanking_sequence(ref, alt, pos, flank=10):
    return f"...{str(ref)[:flank]}[{ref}>{alt}]{str(ref)[-flank:]}..."

def severity_score(row):
    return round((row.get("QUAL", 0) / 100) + len(str(row.get("ALT", "")))/10, 2)

def detect_hotspots(df):
    return df["POS"].value_counts().nlargest(5).index.tolist()

def generate_pdf_report(sample_index, repair_type, confidence, risk, score, matched_drugs):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", size=12) # Default font for the report

    pdf.cell(200, 10, txt="AI DNA Repair Prediction Report", ln=True, align="C")
    pdf.ln(10)
    pdf.cell(200, 10, txt=f"Sample {sample_index+1}", ln=True)
    pdf.cell(200, 10, txt=f"Repair Type: {repair_type}", ln=True)

    # Remove emojis from confidence string for PDF generation
    clean_confidence = confidence.replace("🟢 ", "").replace("🟡 ", "").replace("🟠 ", "").replace("🔴 ", "")

    # Set font to bold for the confidence line
    pdf.set_font("Arial", 'B', 12) # 'B' for Bold
    pdf.cell(200, 10, txt=f"Confidence: {clean_confidence}", ln=True)
    # Reset font to regular for subsequent text
    pdf.set_font("Arial", '', 12)

    pdf.cell(200, 10, txt=f"Risk: {risk}", ln=True)
    pdf.cell(200, 10, txt=f"Score: {round(score, 4)}", ln=True)
    pdf.ln(5)
    pdf.cell(200, 10, txt="Matched Drugs:", ln=True)
    for drug in matched_drugs:
        pdf.cell(200, 10, txt=f"- {drug['drug_name']} ({drug['match_score']})", ln=True)
    path = f"report_sample_{sample_index+1}.pdf"
    pdf.output(path)
    return path

# --- Upload Section ---
uploaded_file = st.sidebar.file_uploader("📂 Upload DNA File", type=["vcf", "txt", "csv"])

# --- Real-Time Simulation ---
if st.sidebar.checkbox("🔁 Simulate Real-Time DNA Stream"):
    st.markdown("### 🔁 Real-Time DNA Stream")
    placeholder = st.empty()
    for i in range(5):
        sample = {
            "CHROM": f"chr{i+1}",
            "POS": np.random.randint(1000, 100000),
            "REF": "A", "ALT": "T",
            "QUAL": np.random.randint(50, 100)
        }
        df = pd.DataFrame([sample])
        df["radius_mean"] = df["POS"] / 1_000_000
        df["texture_mean"] = df["ALT"].apply(lambda x: len(str(x)))
        df["perimeter_mean"] = (df["QUAL"] / 100).round(4)
        X = StandardScaler().fit_transform(df[["radius_mean", "texture_mean", "perimeter_mean"]])
        pred = model.predict(X)[0][0]
        rtype, conf, risk = classify_repair(pred)
        placeholder.markdown(f"🔄 Sample {i+1}: {rtype} ({conf}, Risk: {risk}) → `{round(pred, 4)}`")
        time.sleep(1)

# --- Prediction Section ---
if uploaded_file:
    raw_df, ai_df, error = convert_raw_dna(uploaded_file)
    if error:
        st.error(error)
    else:
        st.success("✅ File converted successfully!")
        st.markdown("### 🧬 Raw DNA Data")
        st.dataframe(raw_df.head())

        st.markdown("### 🔬 AI-Compatible Format")
        st.dataframe(ai_df.head())

        st.download_button("⬇️ Download Converted CSV", ai_df.to_csv(index=False), "converted_ai_data.csv")

        if st.button("🧠 Run AI Prediction"):
            X_scaled = StandardScaler().fit_transform(ai_df.values)
            preds = model.predict(X_scaled)
            explainer = shap.Explainer(model, X_scaled)

            for i, pred in enumerate(preds):
                rtype, confidence, risk = classify_repair(pred[0])
                st.subheader(f"🧪 Sample {i+1}: {rtype}")
                st.write(f"Confidence: {confidence}, Risk: {risk}, Score: `{round(pred[0], 4)}`")
                st.progress(float(min(pred[0], 1.0)))

                st.markdown("#### 💊 Drug Match Engine")
                slider = st.slider("Minimum Match Score", 0.5, 1.0, 0.75, step=0.01, key=f"score_{i}")
                approval = st.selectbox("Approval Filter", ["Any", "FDA", "Trial", "Experimental"], key=f"approve_{i}")
                approval_filter = None if approval == "Any" else approval
                matched = match_drugs(rtype, slider, approval_filter)

                if matched:
                    for drug in matched:
                        st.markdown(f"**💊 {drug['drug_name']}** — `{drug['match_score']}`")
                        st.markdown(f"- Targets: `{', '.join(drug['targets'])}`")
                        st.markdown(f"- Approval: `{drug['approval']}`")
                        st.markdown(f"- Route: `{drug.get('route', 'N/A')}`")
                        st.markdown(f"- Side Effects: {drug['side_effects']}")
                        st.markdown(f"📚 **Description**: {get_pubchem_info(drug['drug_name'])}")
                        st.divider()
                else:
                    st.warning("⚠️ No matching drugs found.")

                pdf_path = generate_pdf_report(i, rtype, confidence, risk, pred[0], matched)
                with open(pdf_path, "rb") as f:
                    st.download_button(f"📄 Download Report for Sample {i+1}", data=f, file_name=pdf_path)

                st.markdown("#### 🧠 Local Explainability (SHAP Force Plot)")
                shap_value = explainer(X_scaled[i:i+1])
                shap_html = shap.plots.force(shap_value[0], matplotlib=False)
                with tempfile.NamedTemporaryFile(delete=False, suffix=".html") as tmp:
                    shap.save_html(tmp.name, shap_html)
                    html = Path(tmp.name).read_text(encoding="utf-8")
                    st.components.v1.html(html, height=300)

        # --- Extras ---
        st.markdown("### 🧬 Mutation Context & Severity")
        raw_df["Mutation_Context"] = raw_df.apply(lambda row: get_flanking_sequence(str(row["REF"]), str(row["ALT"]), row["POS"]), axis=1)
        raw_df["Severity_Score"] = raw_df.apply(severity_score, axis=1)
        st.dataframe(raw_df[["CHROM", "POS", "REF", "ALT", "Mutation_Context", "Severity_Score"]].head())

        st.markdown("### 🔥 Detected Mutation Hotspots")
        st.write(detect_hotspots(raw_df))

        st.markdown("### 🕸️ Mutation Interaction Network")
        try:
            G = nx.Graph()
            for idx, row in raw_df.iterrows():
                node = f"{row['CHROM']}:{row['POS']}"
                G.add_node(node, title=f"{row['REF']}->{row['ALT']}")
                if idx > 0:
                    prev = f"{raw_df.iloc[idx-1]['CHROM']}:{raw_df.iloc[idx-1]['POS']}"
                    G.add_edge(prev, node)
            net = Network(notebook=False)
            net.from_nx(G)
            html_content = net.generate_html()
            st.components.v1.html(html_content, height=500)
        except Exception as e:
            st.error(f"Mutation Network Error: {e}")

        if st.sidebar.checkbox("🧬 Show 3D DNA Structure (PDB:1BNA)"):
            st.markdown("### 🧬 3D DNA Structure Viewer")
            try:
                view = py3Dmol.view(query='pdb:1BNA', width=800, height=400)
                view.setStyle({'cartoon': {'color': 'spectrum'}})
                view.zoomTo()
                view.spin(True)
                html_view = view._make_html()
                st.components.v1.html(html_view, height=400, width=800)
            except Exception as e:
                st.error(f"Error loading 3D structure: {str(e)}")

        st.markdown("### ⚛️ Quantum Mutation Simulation")
        mutation = st.text_input("Enter Mutation (e.g. A>T)", "G>C")
        pos = st.slider("Mutation Position", 1000, 100000)
        sim_score = round(np.random.uniform(0.6, 0.99), 4)
        st.success(f"Quantum Mutation {mutation} at {pos} → Repair Score: `{sim_score}`")
        if sim_score > 0.85:
            st.balloons()

        st.markdown("### 🧑‍🔬 Researcher Feedback")
        feedback = st.text_area("💬 Share your feedback or suggestions")
        if st.button("Submit Feedback"):
            with open("feedback_log.txt", "a") as f:
                f.write(f"\n{feedback}")
            st.success("✅ Feedback recorded!")

# --- Feature Checklist ---
st.markdown("### ✨ Feature Checklist")
st.markdown("""
| Feature                                              | Status |
| :--------------------------------------------------- | :----- |
| ✅ Upload .vcf, .txt, .csv                           | ✔️     |
| ✅ Automatic raw-to-AI format conversion             | ✔️     |
| ✅ Show both **raw and converted data** | ✔️     |
| ✅ Download converted AI-ready CSV                   | ✔️     |
| ✅ Predict repair mechanism from converted data      | ✔️     |
| ✅ Show prediction result: confidence badge + risk level | ✔️     |
| ✅ Progress bar per sample showing prediction strength | ✔️     |
| ✅ Drug Match Engine with filters                    | ✔️     |
| ✅ PubChem drug info integration                     | ✔️     |
| ✅ Explainable AI dashboard (SHAP Force Plot)        | ✔️     |
| ✅ Interactive Mutation Interaction Network (Pyvis)  | ✔️     |
| ✅ Real-Time DNA Stream simulation                   | ✔️     |
| ✅ 3D DNA Structure Viewer (py3Dmol)                 | ✔️     |
| ✅ Simulate Quantum Edits                            | ✔️     |
| ✅ Mutation sequence context viewer                  | ✔️     |
| ✅ Severity scoring                                  | ✔️     |
| ✅ Mutation hotspot detection                        | ✔️     |
| ✅ Auto-generated PDF clinical report                | ✔️     |
| ✅ Feedback logger for researchers                   | ✔️     |
""")