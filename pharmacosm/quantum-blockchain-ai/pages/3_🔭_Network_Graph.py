import streamlit as st
from streamlit_agraph import agraph, Node, Edge, Config
import random

# Import from our core modules
from core import blockchain

st.set_page_config(page_title="Network Graph", page_icon="🔭", layout="wide")
st.title("🔭 Dynamic Network Graph")
st.markdown("An interactive, physics-based visualization of the quantum blockchain network.")

# Check if network is initialized in session state
if "network" not in st.session_state:
    st.session_state.network = blockchain.create_network()

# Convert our QuantumBlocks to agraph nodes and edges
nodes = []
edges = []

for block in st.session_state.network:
    color = "#2ECC40" if not block.is_compromised else "#FF4136"
    size = 15 if not block.is_compromised else 25
    nodes.append(Node(id=block.index, label=f"Node {block.index}", size=size, color=color))

# Simulate a few random entanglement edges
for _ in range(5):
    node_a = random.choice(nodes)
    node_b = random.choice(nodes)
    if node_a.id != node_b.id:
        edges.append(Edge(source=node_a.id, target=node_b.id, type="ENTANGLEMENT", label="Entangled", color="#0074D9"))

# Configuration for the graph
config = Config(width=800,
                height=600,
                directed=False,
                node_shape="dot",
                physics=True, # This is what makes the nodes "move"
                link_distance=200,
                node_size=5,
                repulsion=1000,
                graph_width="100%")

with st.container(border=True):
    return_value = agraph(
        nodes=nodes, 
        edges=edges, 
        config=config
    )

st.divider()

# Display details of a clicked node
if return_value:
    st.subheader("🔬 Node Details")
    node_id = return_value
    selected_node = next((node for node in st.session_state.network if node.index == node_id), None)
    if selected_node:
        st.write(f"**Node ID:** {selected_node.index}")
        st.write(f"**Status:** {'Compromised' if selected_node.is_compromised else 'Secure'}")
        st.write(f"**Hash:** {selected_node.hash}")
        st.write(f"**Data:** {selected_node.data}")
    else:
        st.info("Click a node to view its details.")