import streamlit as st
from core import blockchain

st.set_page_config(page_title="Network Explorer", page_icon="🌐")

st.title("🌐 Quantum Network Explorer")

# Initialize session state if it doesn't exist
if "network" not in st.session_state:
    st.session_state.network = blockchain.create_network()

col1, col2 = st.columns([2, 1])

with col1:
    blockchain.render_network(st.session_state.network)

with col2:
    if st.button("🔄 Refresh Network"):
        st.session_state.network = blockchain.create_network()
    
    if st.button("⚡ Simulate Mining"):
        blockchain.simulate_mining(st.session_state.network)

    if st.button("🔗 Simulate Entanglement"):
        blockchain.simulate_entanglement(st.session_state.network)

    st.divider()
    
    total = len(st.session_state.network)
    compromised = sum(1 for n in st.session_state.network if n.is_compromised)
    secure = total - compromised

    st.metric("🔐 Secure Nodes", secure)
    st.metric("⚠️ Compromised Nodes", compromised)
st.subheader("📊 Network Status Overview")
status_df = pd.DataFrame({
    'Status': ['Secure', 'Compromised'],
    'Count': [secure, compromised]
})
st.bar_chart(status_df, x='Status', y='Count', color='#FF4B4B' if compromised > 0 else '#2ECC40')