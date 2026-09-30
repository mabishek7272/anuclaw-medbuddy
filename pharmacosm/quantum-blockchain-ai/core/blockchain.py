import streamlit as st
import random
import uuid

# Global constants for configuration
NUM_NODES = 100
COMPROMISED_NODES = 20

class QuantumBlock:
    def __init__(self, index, data):
        self.index = index
        self.data = data
        self.hash = f"QHASH-{index}-{random.randint(1000,9999)}"
        self.is_compromised = False

    def compromise(self):
        self.is_compromised = True
        self.hash = f"QHASH-INVALID-{random.randint(1000,9999)}"

# Use st.cache_resource for heavy object creation that runs once per session
@st.cache_resource(show_spinner=False)
def create_network(num_nodes=NUM_NODES, compromised=COMPROMISED_NODES):
    """Initializes the network of quantum nodes."""
    nodes = [QuantumBlock(i, f"Node {i} Data") for i in range(num_nodes)]
    for _ in range(compromised):
        nodes[random.randint(0, num_nodes - 1)].compromise()
    return nodes

def render_network(nodes):
    """Displays the network grid in the Streamlit UI."""
    cols = st.columns(10)
    for i, node in enumerate(nodes):
        col = cols[i % 10]
        color = "red" if node.is_compromised else "green"
        with col:
            st.markdown(f"""
                <div style='border:1px solid #999;padding:5px;background-color:{color};color:white;text-align:center'>
                Node {node.index}<br/>{node.hash[-5:]}</div>
            """, unsafe_allow_html=True)

def simulate_mining(nodes):
    """Simulates a node mining a new block."""
    miner = random.choice(nodes)
    tx_count = random.randint(1, 4)
    txs = [
        {
            "tx_id": str(uuid.uuid4())[:8],
            "from": f"Node_{random.randint(0, 99)}",
            "to": f"Node_{random.randint(0, 99)}",
            "amount": f"{random.randint(5,100)} QC"
        } for _ in range(tx_count)
    ]

    st.success(f"🪙 Node {miner.index} mined block with {tx_count} txs")
    st.json(txs)

    rejected_by = random.sample([n for n in nodes if n != miner], k=5)
    for node in rejected_by:
        st.warning(f"⛔ Node {node.index} rejected invalid block")

def simulate_entanglement(nodes):
    """Simulates entanglement between two random nodes."""
    a, b = random.sample(nodes, 2)
    secret = hex(random.getrandbits(32))
    st.info(f"🔗 Entangled Node {a.index} and Node {b.index} with secret `{secret}`")