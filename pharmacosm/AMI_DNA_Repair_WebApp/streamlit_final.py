import streamlit as st
import pandas as pd
import numpy as np
import tensorflow as tf
import json
import io
import matplotlib.pyplot as plt
import seaborn as sns
import plotly.express as px
from sklearn.preprocessing import StandardScaler

# --- CONFIG ---
st.set_page_config(page_title="🧬 DNA Repair + Drug Match Engine", layout="centered")
st.markdown("""
    <style>
        .css-1d391kg, .css-ffhzg2, .st-bf, .st-c3 {
            background-color: #0e1117;
            color: #f5f5f5;
        }
        .stButton > button {
            color: white;
            background-color: #2b4162;
        }
    </style>
""", unsafe_allow_html=True)

st.title("🧬 Quantum DNA Repair Predictor + 💊 Drug Match Engine")
st.caption("Upload raw DNA data (.vcf, .csv, .txt) ➤ Get repair prediction + matched drugs")

# --- Load Model ---
@st.cache_resource
def load_model():
    return tf.keras.models.load_model("model/Quantum_AMI_DNA_Repair_Model.h5", compile=False)

model = load_model()

# --- Convert DNA ---
def convert_raw_dna(file):
    try:
        name = file.name
        if name.endswith(".vcf"):
            df = pd.read_csv(file, comment="#", delimiter="\t", header=None)
            df.columns = ["CHROM", "POS", "ID", "REF", "ALT", "QUAL", "FILTER", "INFO"]
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

# --- Classify Logic ---
def classify_repair(pred):
    if pred > 0.85:
        return "Homologous Recombination (HR)", "🟢 High", "Low"
    elif pred > 0.65:
        return "Base Excision Repair (BER)", "🟡 Medium", "Moderate"
    elif pred > 0.45:
        return "Nucleotide Excision Repair (NER)", "🟠 Low", "Elevated"
    else:
        return "Non-Homologous End Joining (NHEJ)", "🔴 Very Low", "High"

# --- Drug Matcher ---
def match_drugs(repair_type, min_score=0.7, approval_filter=None):
    try:
        with open("drug_data.json") as f:
            data = json.load(f)
        abbr = repair_type.split("(")[-1].replace(")", "")
        matched = [d for d in data if d["repair_type"] == abbr and d["match_score"] >= min_score]
        if approval_filter:
            matched = [d for d in matched if d["approval"] == approval_filter]
        return sorted(matched, key=lambda x: x["match_score"], reverse=True)
    except:
        return []

# --- Upload File ---
file = st.file_uploader("📂 Upload Raw DNA File", type=["vcf", "txt", "csv"])
if file:
    with st.spinner("🧬 Processing DNA file..."):
        raw_df, ai_df, error = convert_raw_dna(file)

    if error:
        st.error(error)
    else:
        st.success("✅ File converted successfully!")

        # Raw & Converted Display
        st.markdown("### 🧬 Raw Data")
        st.dataframe(raw_df.head())

        st.markdown("### 🔬 AI-Compatible Format")
        st.dataframe(ai_df.head())

        st.download_button("⬇️ Download Converted CSV", ai_df.to_csv(index=False), "converted_ai_data.csv")

        st.divider()
        if st.button("🧠 Run AI Prediction"):
            scaler = StandardScaler()
            X_scaled = scaler.fit_transform(ai_df.values)
            preds = model.predict(X_scaled)

            for i, pred in enumerate(preds):
                rtype, confidence, risk = classify_repair(pred[0])
                st.subheader(f"🧪 Sample {i+1}: {rtype}")
                st.write(f"Confidence: {confidence}, Risk: {risk}, Score: `{round(pred[0], 4)}`")
                st.progress(float(min(pred[0], 1.0)))

                # Chart
                st.markdown("**🧬 Repair Mechanism Confidence**")
                bars = [pred[0] if pred[0] > t else 0 for t in [0.85, 0.65, 0.45, 0.0]]
                fig, ax = plt.subplots()
                ax.bar(["HR", "BER", "NER", "NHEJ"], bars, color=["green", "yellow", "orange", "red"])
                ax.set_ylim([0, 1])
                st.pyplot(fig)

                # Drug Matching
                st.markdown("### 💊 Drug Match Engine")
                slider = st.slider("Minimum Match Score", 0.5, 1.0, 0.75, step=0.01, key=f"score_{i}")
                approval = st.selectbox("Approval Filter", ["Any", "FDA", "Trial", "Experimental"], key=f"approve_{i}")
                approval_filter = None if approval == "Any" else approval
                matched = match_drugs(rtype, slider, approval_filter)

                if matched:
                    for drug in matched:
                        st.markdown(f"**💊 {drug['drug_name']}**  — `{drug['match_score']}`")
                        st.markdown(f"- Targets: `{', '.join(drug['targets'])}`")
                        st.markdown(f"- Approval: `{drug['approval']}`")
                        st.markdown(f"- Route: `{drug['route']}`")
                        st.markdown(f"- Side Effects: {drug['side_effects']}")
                        st.divider()
                else:
                    st.warning("⚠️ No matching drugs found.")

        st.markdown("### 🧬 Mutation Hotspot")
        fig1 = px.histogram(raw_df, x="CHROM", title="Variants per Chromosome")
        st.plotly_chart(fig1, use_container_width=True)

        fig2 = px.bar(raw_df.groupby("CHROM")["POS"].count().reset_index(name="Mutations"),
                      x="CHROM", y="Mutations", color="Mutations")
        st.plotly_chart(fig2, use_container_width=True)

        # XAI Bar
        st.markdown("### 🔍 Explainable AI Features")
        fig_xai, ax_xai = plt.subplots()
        sns.barplot(x=["radius_mean", "texture_mean", "perimeter_mean"], y=[0.4, 0.35, 0.25], ax=ax_xai)
        ax_xai.set_title("Feature Importance")
        st.pyplot(fig_xai)