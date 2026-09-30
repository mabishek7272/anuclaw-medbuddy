# ANUClaw Lab Automation & XR Suite

Physical laboratory automation, AR/XR lab integration, robot control (Opentrons), self-driving lab, Benchling LIMS integration, and wet-lab image analysis.

## When to Use
- User is working in a physical lab and needs automation
- Opentrons liquid handling robot commands
- AR/XR lab guidance (hand tracking, step overlays, 3D pose)
- Gel, blot, or colony image analysis
- Benchling or LabArchives integration
- Self-driving lab / Bayesian experiment optimisation
- Protocol design and execution

## Capabilities

### Wet-Lab Image Analysis (Vision)
```python
# Send the image to Claude's vision model for analysis
def analyze_gel_image(image_path):
    """
    Analyse SDS-PAGE gel or Western blot image.
    Returns band quality assessment, molecular weight estimation, and recommendations.
    """
    # The Claude agent will visually analyse the image
    prompt = f"""Analyse this gel/blot image at {image_path}:
    
1. Identify each lane and band
2. Assess band quality (sharp/diffuse/smeared)
3. Estimate molecular weights relative to ladder
4. Flag any quality issues (overloading, degradation, air bubbles)
5. Recommend next steps

Provide a structured report."""
    return prompt

def analyze_colony_plate(image_path):
    """Count and classify bacterial/yeast colonies on a plate image."""
    prompt = f"""Count and classify colonies on the plate image at {image_path}:
1. Total colony count
2. Colony morphology (size, colour, shape)
3. Any contamination or abnormal colonies
4. Plate quality assessment"""
    return prompt
```

### Opentrons Robot Control (Python)
```python
from opentrons import protocol_api

metadata = {
    "protocolName": "ANUClaw Generated Protocol",
    "author": "ANUClaw",
    "description": "Auto-generated liquid handling protocol",
    "apiLevel": "2.16",
}

def run(protocol: protocol_api.ProtocolContext):
    # Load labware
    tiprack = protocol.load_labware("opentrons_96_tiprack_200ul", 1)
    plate = protocol.load_labware("corning_96_wellplate_360ul_flat", 2)
    reservoir = protocol.load_labware("nest_12_reservoir_15ml", 3)
    
    # Load pipette
    p200 = protocol.load_instrument("p200_single", "right", tip_racks=[tiprack])
    
    # Transfer sample to wells
    p200.transfer(
        volume=50,
        source=reservoir["A1"],
        dest=plate.wells()[:8],
        new_tip="always",
        mix_after=(3, 50),
    )
```

### Benchling LIMS Integration
```python
import benchling_sdk
from benchling_sdk.auth.client_credentials_oauth2 import ClientCredentialsOAuth2

def connect_benchling(client_id, client_secret, url):
    auth = ClientCredentialsOAuth2(client_id=client_id, client_secret=client_secret)
    client = benchling_sdk.Benchling(url=url, auth_method=auth)
    return client

def create_notebook_entry(client, folder_id, title, text):
    return client.entries.create(
        benchling_sdk.EntryCreate(
            name=title,
            folder_id=folder_id,
            fields={"Note": {"value": text}},
        )
    )

def register_entity(client, schema_id, name, fields):
    return client.custom_entities.create(
        benchling_sdk.CustomEntityCreate(
            name=name,
            schema_id=schema_id,
            fields=fields,
        )
    )
```

### Self-Driving Lab — Bayesian Optimisation
```python
from scipy.stats import norm
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import RBF, ConstantKernel
import numpy as np

class SelfDrivingLab:
    """Bayesian optimisation for experimental parameter tuning."""

    def __init__(self, param_bounds):
        self.param_bounds = param_bounds  # {"temp": [20, 80], "pH": [6, 9], ...}
        self.X_obs = []
        self.y_obs = []
        kernel = ConstantKernel(1.0) * RBF(length_scale=1.0)
        self.gp = GaussianProcessRegressor(kernel=kernel, alpha=1e-6, normalize_y=True)

    def suggest_next_experiment(self, n_candidates=1000):
        """Suggest the next set of experimental parameters to try."""
        bounds = np.array(list(self.param_bounds.values()))
        candidates = np.random.uniform(bounds[:, 0], bounds[:, 1], size=(n_candidates, len(bounds)))

        if len(self.X_obs) < 2:
            idx = np.random.randint(n_candidates)
            return dict(zip(self.param_bounds.keys(), candidates[idx]))

        self.gp.fit(np.array(self.X_obs), np.array(self.y_obs))
        mu, sigma = self.gp.predict(candidates, return_std=True)
        
        # Expected Improvement acquisition
        best = max(self.y_obs)
        z = (mu - best) / (sigma + 1e-9)
        ei = (mu - best) * norm.cdf(z) + sigma * norm.pdf(z)
        best_idx = np.argmax(ei)
        return dict(zip(self.param_bounds.keys(), candidates[best_idx]))

    def register_result(self, params, outcome):
        """Register the result of an experiment."""
        self.X_obs.append(list(params.values()))
        self.y_obs.append(outcome)
```

### XR / AR Lab Guidance
```python
# Hand tracking and 3D pose estimation for AR lab overlays
# Integrates with LabOS XR runtime

def generate_ar_protocol_steps(protocol_text):
    """
    Convert a written lab protocol into AR step-by-step overlay instructions.
    Returns JSON suitable for LabOS XR display.
    """
    # Parse protocol into discrete steps
    steps = []
    for i, line in enumerate(protocol_text.strip().split('\n'), 1):
        if line.strip():
            steps.append({
                "step": i,
                "instruction": line.strip(),
                "requires_confirmation": "vortex" in line.lower() or "centrifuge" in line.lower(),
                "hazard_level": "high" if any(w in line.lower() for w in ["acid", "toxic", "flammable", "hazard"]) else "low",
            })
    return {"protocol_steps": steps, "total_steps": len(steps)}

def hand_tracking_guidance(current_step, detected_gesture):
    """
    Map hand gestures to protocol step progression in AR.
    Returns next instruction or confirmation.
    """
    gestures = {
        "thumbs_up": "step_complete",
        "point": "show_detail",
        "open_palm": "pause",
        "fist": "emergency_stop",
    }
    action = gestures.get(detected_gesture, "unknown")
    return {"action": action, "current_step": current_step}
```

## Supported Instruments
- Opentrons OT-2, OT-3 (liquid handling robots)
- Hamilton STAR (via Python API)
- BioTek plate readers
- Tecan Fluent (via scripting)
- LabOS XR headsets (AR overlays)

## Lab Information Systems
- Benchling (LIMS + ELN)
- LabArchives (ELN)
- SciNote (ELN)
- Custom LIMS via REST API
