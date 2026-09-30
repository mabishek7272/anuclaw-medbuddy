# visualizer/entanglement_chart.py

import plotly.graph_objects as go
import numpy as np

def create_entanglement_chord_diagram(nodes, matrix):
    """
    Visualizes the drug-patient entanglement map as an interactive chord diagram.
    """
    fig = go.Figure()
    
    n = len(nodes)
    if n == 0:
        return fig # Return empty figure if no nodes

    # Convert matrix to numpy array for easier manipulation
    matrix = np.array(matrix)
    
    # Define colors: Drug is special, Genes are one color, Organs another
    colors = ['#00BFFF'] # Drug color
    for node in nodes[1:]:
        if node in ['Heart', 'Liver', 'Kidney', 'Brain', 'Lungs']:
            colors.append('#FF6347') # Organs
        else:
            colors.append('#98FB98') # Genes

    # Create the chord diagram using a heatmap trace as a base
    fig.add_trace(go.Heatmap(
        z=matrix,
        x=nodes,
        y=nodes,
        colorscale='Viridis',
        showscale=False
    ))

    # This is a simplified representation of a chord diagram using heatmap
    # For a true chord diagram, one would typically use a library like HoloViews or a custom Plotly setup.
    # This heatmap gives a good visual proxy of the connection strengths.

    fig.update_layout(
        title_text='Quantum Entanglement Map',
        xaxis_title='Bio-Nodes',
        yaxis_title='Bio-Nodes',
        height=500,
        margin=dict(l=20, r=20, t=40, b=20)
    )
    # A more advanced chord diagram would require more complex setup, this heatmap is a start
    # To make it more like a chord diagram, we can use scatter points to represent nodes
    angles = np.linspace(0, 2*np.pi, n, endpoint=False)
    x_nodes = np.cos(angles)
    y_nodes = np.sin(angles)

    fig = go.Figure()
    # Add nodes
    fig.add_trace(go.Scatter(
        x=x_nodes, y=y_nodes,
        mode='markers+text',
        text=nodes,
        marker=dict(size=20, color=colors),
        textposition='top center'
    ))

    # Add edges (chords)
    for i in range(n):
        for j in range(i + 1, n):
            if matrix[i][j] > 0:
                fig.add_trace(go.Scatter(
                    x=[x_nodes[i], x_nodes[j]],
                    y=[y_nodes[i], y_nodes[j]],
                    mode='lines',
                    line=dict(width=matrix[i][j] * 10, color='rgba(128,128,128,0.5)'),
                    hoverinfo='none'
                ))

    fig.update_layout(
        title_text='Quantum Entanglement Map',
        showlegend=False,
        xaxis=dict(showgrid=False, zeroline=False, visible=False),
        yaxis=dict(showgrid=False, zeroline=False, visible=False),
        height=600,
        plot_bgcolor='rgba(0,0,0,0)'
    )

    return fig