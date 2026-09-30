import numpy as np
import plotly.graph_objects as go

# Simulate drug distribution for 4 organs using exponential decay models
def simulate_distribution(dose_mg=100):
    time = np.linspace(0, 24, 50)  # 24 hours, 50 time steps
    organs = {
        "Liver": dose_mg * np.exp(-0.1 * time),
        "Heart": dose_mg * np.exp(-0.08 * time),
        "Brain": dose_mg * np.exp(-0.04 * time),
        "Kidney": dose_mg * np.exp(-0.12 * time),
    }
    return time, organs

# Plotting function
def plot_distribution(time, organs):
    fig = go.Figure()

    for organ, conc in organs.items():
        fig.add_trace(go.Scatter(
            x=time,
            y=conc,
            mode='lines+markers',
            name=organ,
            line=dict(width=2),
            hovertemplate=f"<b>{organ}</b><br>Time: %{{x}} hr<br>Conc: %{{y:.2f}} mg<extra></extra>"
        ))

    fig.update_layout(
        title="🧬 Organ Drug Concentration Simulation",
        xaxis_title="Time (hours)",
        yaxis_title="Concentration (mg)",
        yaxis=dict(range=[0, max([max(c) for c in organs.values()]) + 10]),
        template="plotly_white",
        legend_title="Organs"
    )

    return fig