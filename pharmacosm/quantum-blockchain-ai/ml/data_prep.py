import pandas as pd
import numpy as np

def load_data(file_path="data/project_anu_log.csv"):
    """Loads and preprocesses the event log data."""
    try:
        df = pd.read_csv(file_path)
        # Add synthetic features for our model
        np.random.seed(42)
        df['entropy'] = np.random.rand(len(df)).round(3)
        # Create a binary target variable
        df['is_compromised'] = df['Event'].str.contains("Compromised|Rejected", case=False).astype(int)
        # The 'Node' column might contain "23<->44" or just "12", so we'll need a single index.
        df['node_index'] = df['Node'].apply(lambda x: int(x.split('<')[0]) if '<' in str(x) else int(x))
        return df
    except FileNotFoundError:
        st.error(f"Error: The file '{file_path}' was not found. Please ensure it's in the data/ directory.")
        return None