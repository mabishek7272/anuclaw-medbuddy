import streamlit as st

st.set_page_config(
    page_title="Quantum AI Medtech R&D",
    page_icon="⚛️",
    layout="wide"
)

st.title("Project ANU: Quantum Blockchain & AI Prediction")
st.markdown("A fusion of quantum computing and AI to secure next-gen medtech infrastructure. **Welcome, Chief.**")

st.divider()

st.header("Home")
st.write("This application demonstrates a simulated quantum blockchain network and an AI-powered system for predicting node compromises based on network telemetry data. Use the sidebar to navigate between the different parts of the project.")

st.info("""
**🌐 Quantum Blockchain Explorer:** Visualize a network of quantum nodes, simulate events like mining and entanglement, and observe network integrity.

**🧠 AI Predictive Engine:** Upload a blockchain log to train a model that predicts compromised nodes, with detailed explainability powered by SHAP.
""")