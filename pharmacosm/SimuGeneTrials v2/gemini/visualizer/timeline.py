# visualizer/timeline.py

import plotly.graph_objects as go

def generate_timeline_chart(side_effect_risks, total_days=30):
    """
    Creates an interactive timeline of predicted side effect onset and severity.
    """
    fig = go.Figure()
    
    # Simple model: assume peak risk at 1/3 of the cycle
    peak_day = total_days / 3.0
    
    for effect, risk in side_effect_risks.items():
        if risk > 0.1: # Only plot significant risks
            fig.add_trace(go.Scatter(
                x=[0, peak_day, total_days],
                y=[0, risk, risk * 0.5], # Model onset, peak, and tapering
                mode='lines',
                name=effect,
                hovertemplate=f'<b>{effect}</b><br>Peak Risk: {risk*100:.1f}%<extra></extra>'
            ))
            
    fig.update_layout(
        title="Predicted Side Effect Severity Over Time",
        xaxis_title="Days into Treatment Cycle",
        yaxis_title="Severity Risk (0 to 1)",
        yaxis=dict(range=[0, 1]),
        legend_title="Side Effect",
        margin=dict(l=20, r=20, t=40, b=20)
    )
    return fig