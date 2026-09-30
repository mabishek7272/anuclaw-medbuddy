import streamlit as st
from core.ehr import ElectronicHealthRecord
import uuid
import pandas as pd

st.set_page_config(page_title="Secure EHR", page_icon="⚕️", layout="wide")
st.title("⚕️ Secure EHR & QKD Simulation")
st.markdown("This page demonstrates how quantum key distribution can secure sensitive patient data.")

# Store records in session state
if 'ehr_records' not in st.session_state:
    st.session_state.ehr_records = {}

# User-facing UI
col1, col2 = st.columns(2)

with col1:
    st.subheader("Create a New Patient Record")
    patient_id = st.text_input("Patient ID", value=str(uuid.uuid4())[:4])

    if st.button("➕ Create Record"):
        new_record = ElectronicHealthRecord(patient_id)
        st.session_state.ehr_records[patient_id] = new_record
        st.success(f"Record for Patient {patient_id} created successfully!")
        st.json(new_record.data)

with col2:
    st.subheader("Secure Transmission (QKD)")
    if st.session_state.ehr_records:
        patient_ids = list(st.session_state.ehr_records.keys())
        selected_patient = st.selectbox("Select Patient to Transmit", options=patient_ids)

        # Simulate a QKD-generated key
        qkd_key = str(uuid.uuid4())
        st.code(f"Simulated QKD Key: {qkd_key}", language="text")

        if st.button("🔒 Encrypt & Transmit Record"):
            record = st.session_state.ehr_records[selected_patient]
            encrypted_data = record.encrypt_with_qkd(qkd_key)
            st.info("Record encrypted! This is what an eavesdropper would see:")
            st.code(encrypted_data, language="text")
            st.session_state.ehr_records[selected_patient] = record

        if st.button("🔑 Decrypt Record at Receiver"):
            record = st.session_state.ehr_records[selected_patient]
            decrypted_data = record.decrypt_with_qkd(qkd_key)
            st.success("Record decrypted!")
            st.json(record.data)
    else:
        st.info("Create a patient record first to enable transmission.")

st.divider()

st.subheader("All Records")
st.dataframe(pd.DataFrame([
    {
        "Patient ID": record.patient_id,
        "Record ID": record.record_id,
        "Created At": record.created_at,
        "Status": "Encrypted" if record.is_encrypted else "Decrypted"
    } for record in st.session_state.ehr_records.values()
]))