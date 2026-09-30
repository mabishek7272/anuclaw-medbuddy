# modules/pdf_generator.py

from weasyprint import HTML
import json

def create_report_pdf(report_data):
    """
    Generates a PDF report from the simulation result dictionary.
    """
    
    # --- Helper to convert a dictionary to an HTML table ---
    def dict_to_html_table(data_dict, title="Details"):
        if not data_dict or not isinstance(data_dict, dict):
            return f"<h3>{title}</h3><p>N/A</p>"
        
        rows = ""
        for key, value in data_dict.items():
            # Nicely format keys and handle nested data
            key_formatted = str(key).replace("_", " ").title()
            if isinstance(value, list):
                value_formatted = ", ".join(map(str, value))
            elif isinstance(value, dict):
                 value_formatted = "<br>".join([f"<b>{k.replace('_', ' ').title()}:</b> {v}" for k,v in value.items()])
            else:
                value_formatted = str(value)
            rows += f"<tr><th>{key_formatted}</th><td>{value_formatted}</td></tr>"
            
        return f"<h3>{title}</h3><table class='data-table'>{rows}</table>"

    # --- Start building the HTML string ---
    title_text = f"SimuGene Trial Report: {report_data.get('summary', {}).get('patient_id', 'N/A')}"
    
    html = f"""
    <html>
    <head>
        <title>{title_text}</title>
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #0E1117; color: #FAFAFA; line-height: 1.6; }}
            h1, h2, h3 {{ color: #00BFFF; border-bottom: 1px solid #3c4251; padding-bottom: 5px; font-weight: 400; }}
            h1 {{ font-size: 28px; }}
            h2 {{ font-size: 22px; }}
            h3 {{ font-size: 18px; color: #aab2c0; border-bottom: none; margin-top: 20px; }}
            .container {{ padding: 30px; }}
            .section {{ margin-bottom: 20px; background-color: #161A22; padding: 20px; border-radius: 8px; border: 1px solid #262b38;}}
            .data-table {{ width: 100%; border-collapse: collapse; }}
            .data-table th, .data-table td {{ padding: 10px; text-align: left; border-bottom: 1px solid #262b38; }}
            .data-table th {{ width: 35%; color: #aab2c0; font-weight: 500; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>{title_text}</h1>
            
            <div class="section">
                <h2>Summary</h2>
                {dict_to_html_table(report_data.get("summary", {}), title="")}
            </div>

            <div class="section">
                <h2>Personalized Dosing Recommendation</h2>
                {dict_to_html_table(report_data.get("dosing_recommendation", {}), title="")}
            </div>

            <div class="section">
                <h2>Explainability & Quantum Score</h2>
                {dict_to_html_table(report_data.get("explainability", {}), title="")}
            </div>
            
            <div class="section">
                <h2>Risk Assessment</h2>
                {dict_to_html_table(report_data.get("risk_assessment", {}).get("predicted_side_effects", {}), title="Predicted Side Effects")}
                {dict_to_html_table(report_data.get("risk_assessment", {}).get("predicted_organ_failure_risk", {}), title="Organ Failure Risk")}
            </div>
        </div>
    </body>
    </html>
    """
    
    # --- Use WeasyPrint to render the HTML into a PDF in memory ---
    return HTML(string=html).write_pdf()