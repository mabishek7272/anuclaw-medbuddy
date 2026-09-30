import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import shap
import streamlit as st
import matplotlib.pyplot as plt  # Import matplotlib to manage figures

def train_and_predict(df):
    """Trains a model and returns predictions and feature importance."""
    if df is None or df.empty:
        st.warning("No data to train the model on.")
        return None

    # Define features and target
    X = df[['node_index', 'entropy']]
    y = df['is_compromised']

    # Handle cases with only one class for training
    if len(y.unique()) < 2:
        st.warning("Cannot train model with only one class. (e.g., all nodes are secure).")
        return None
    
    # Split and scale the data
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42)
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_all_scaled = scaler.transform(X)

    # Train the model
    model = LogisticRegression()
    model.fit(X_train_scaled, y_train)

    # Make predictions and get confidence scores
    df['AI_Predicted_Compromise'] = model.predict(X_all_scaled)
    df['Confidence'] = model.predict_proba(X_all_scaled)[:, 1].round(3)
    
    # Explain the model with SHAP
    explainer = shap.Explainer(model, X_train_scaled, feature_names=X.columns)
    shap_values = explainer(X_all_scaled)

    return df, shap_values, X.columns

def plot_shap_summary(shap_values, feature_names):
    """Renders a SHAP summary plot for global model interpretability."""
    st.subheader("Global AI Explainability (SHAP Summary Plot)")
    with st.container(border=True):
        # Generate the plot without showing it
        shap.summary_plot(shap_values, feature_names=feature_names, show=False)
        
        # Get the current figure and pass it to Streamlit
        fig = plt.gcf()
        st.pyplot(fig, bbox_inches='tight')
        
        # Close the figure to free up memory
        plt.close(fig)

def plot_individual_prediction(df, shap_values):
    """Renders a SHAP force plot for a single prediction."""
    st.subheader("Individual Prediction Analysis (SHAP Force Plot)")
    node_to_explain = st.number_input("Enter Node Index to Explain:", min_value=0, max_value=99, value=12)

    if node_to_explain in df['node_index'].values:
        idx = df[df['node_index'] == node_to_explain].index[0]
        st.write(f"Analyzing prediction for Node {node_to_explain}...")
        
        # Display the prediction and confidence
        prediction = df.loc[idx, 'AI_Predicted_Compromise']
        confidence = df.loc[idx, 'Confidence']
        st.write(f"Prediction: {'Compromised' if prediction == 1 else 'Secure'}")
        st.write(f"Confidence: {confidence}")

        # Plot the SHAP force plot
        st.write("Force Plot:")
        with st.container(border=True):
            shap.initjs()
            st.write(shap.force_plot(
                shap_values[idx],
                shap_values.data[idx],
                matplotlib=False,
                feature_names=shap_values.feature_names
            ))
    else:
        st.warning(f"Node {node_to_explain} not found in the log.")