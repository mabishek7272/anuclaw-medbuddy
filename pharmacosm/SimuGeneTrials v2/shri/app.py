# app.py
import streamlit as st
import pandas as pd
import json, os, datetime
from engine import rule_based_check, safe_generate

st.set_page_config(page_title="SHRI – Clinical Paramedic AI", layout="wide")

st.title("🩺 SHRI – Clinical Paramedic AI")

# Input vitals
with st.sidebar:
    st.header("Enter Vitals")
    hr = st.number_input("Heart Rate (bpm)", 30, 220, 80)
    spo2 = st.number_input("SpO₂ (%)", 50, 100, 98)
    bp_sys = st.number_input("BP Systolic", 80, 200, 120)
    bp_dia = st.number_input("BP Diastolic", 40, 120, 80)
    temp = st.number_input("Temperature (°C)", 34.0, 42.0, 37.0)
    rr = st.number_input("Respiratory Rate", 8, 40, 18)

if st.button("Generate Recommendation"):
    vitals = {"HR": hr, "SpO2": spo2, "BP_sys": bp_sys, "BP_dia": bp_dia, "Temp": temp, "RR": rr}
    # Rule check first
    note = rule_based_check(vitals)
    if not note:
        prompt = f"Vitals: HR={hr}, SpO2={spo2}, BP={bp_sys}/{bp_dia}, Temp={temp}, RR={rr}. Provide 1-line doctor-style recommendation."
        note = safe_generate(prompt)

    # Display
    st.subheader("Recommendation")
    st.success(note)

    # Logging
    os.makedirs("logs", exist_ok=True)
    log = {"timestamp": datetime.datetime.now().isoformat(), "vitals": vitals, "note": note}
    with open(f"logs/log_{datetime.date.today()}.json", "a") as f:
        f.write(json.dumps(log) + "\n")
