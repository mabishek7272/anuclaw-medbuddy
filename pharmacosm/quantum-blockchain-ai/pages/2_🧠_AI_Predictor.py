import streamlit as st
import pandas as pd
from ml import data_prep, model

st.set_page_config(page_title="AI Predictor", page_icon="🧠")

st.title("🧠 AI Predictive Engine")
st.markdown("Upload a blockchain log to train an AI model for compromise detection.")

# Use a file uploader
uploaded_file = st.file_uploader("📁 Upload Blockchain Log CSV", type=["csv"])

if uploaded_file:
    log_df = data_prep.load_data(uploaded_file)
    if log_df is not None:
        st.subheader("📄 Raw Event Logs")
        st.dataframe(log_df.head())

        # Button to trigger AI analysis
        if st.button("🚀 Run AI Analysis"):
            with st.spinner("Training and explaining the model..."):
                predicted_df, shap_values, feature_names = model.train_and_predict(log_df)
                if predicted_df is not None:
                    st.success("✅ Analysis Complete!")
                    st.subheader("🔍 Prediction Results")
                    st.dataframe(predicted_df[['Node', 'Event', 'entropy', 'AI_Predicted_Compromise', 'Confidence']].head(15))
                    
                    # Download button for the results
                    csv_out = predicted_df.to_csv(index=False).encode('utf-8')
                    st.download_button(
                        label="📥 Download Predicted Log CSV",
                        data=csv_out,
                        file_name="predicted_log.csv",
                        mime="text/csv"
                    )

                    st.divider()

                    # SHAP Plots
                    model.plot_shap_summary(shap_values, feature_names)
                    st.divider()
                    model.plot_individual_prediction(predicted_df, shap_values)