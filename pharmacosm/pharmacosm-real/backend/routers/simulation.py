"""
Virtual Trial Simulation Router
Preserved SimuGeneTrials engine — now enriched with real ChEMBL drug data.
Runs the existing simulation logic from SimuGeneTrials v2.
"""

import json
import sys
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

# Point to the original SimuGeneTrials v2 engine
SIMUGENE_DIR = Path(__file__).parent.parent.parent.parent / "SimuGeneTrials v2"
DATA_DIR = SIMUGENE_DIR / "data"


def load_json(path: Path) -> dict | list:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


class SimulationRequest(BaseModel):
    patient_id: str
    drug_name: str
    mood_state: Optional[str] = "Neutral"


@router.get("/patients")
def get_patients():
    """Get the list of virtual patients available for simulation."""
    try:
        patients = load_json(DATA_DIR / "virtual_patients.json")
        return {
            "patients": [
                {
                    "id": p["id"],
                    "age": p.get("phenotype", {}).get("age"),
                    "sex": p.get("phenotype", {}).get("sex"),
                    "diagnosis": p.get("phenotype", {}).get("diagnosis"),
                    "mutations": p.get("genomic_profile", {}).get("somatic_mutations", []),
                    "tmb": p.get("genomic_profile", {}).get("tumor_mutational_burden_tmb"),
                    "msi": p.get("genomic_profile", {}).get("microsatellite_instability_msi"),
                }
                for p in patients
            ]
        }
    except Exception as e:
        raise HTTPException(500, detail=str(e))


@router.get("/drugs")
def get_drugs():
    """Get available drugs for simulation."""
    try:
        drugs = load_json(DATA_DIR / "beast_drug_db.json")
        return {
            "drugs": [
                {
                    "name": d["drug_name"],
                    "mechanism": d.get("mechanism"),
                    "approval": d.get("approval"),
                    "indications": d.get("indications", []),
                    "repair_type": d.get("repair_type"),
                    "chembl_id": d.get("drug_id"),
                }
                for d in drugs
            ]
        }
    except Exception as e:
        raise HTTPException(500, detail=str(e))


@router.post("/run")
def run_simulation(req: SimulationRequest):
    """
    Run the quantum-inspired virtual clinical trial simulation.
    Uses the preserved SimuGeneTrials v2 engine.
    """
    # Add SimuGeneTrials to path temporarily
    sys.path.insert(0, str(SIMUGENE_DIR))
    try:
        from simulator import simulate_trial

        # Load all databases
        patients = load_json(DATA_DIR / "virtual_patients.json")
        drugs = load_json(DATA_DIR / "beast_drug_db.json")
        moods = load_json(DATA_DIR / "mood_profiles.json")
        rare_diseases = load_json(DATA_DIR / "rare_disease_profiles.json")
        organs = load_json(DATA_DIR / "organ_profiles.json")

        result = simulate_trial(
            patient_id=req.patient_id,
            drug_name=req.drug_name,
            mood_state=req.mood_state,
            patients_db=patients,
            drugs_db=drugs,
            moods_db=moods,
            rare_diseases_db=rare_diseases,
            organ_db=organs,
        )

        if "error" in result:
            raise HTTPException(400, detail=result["error"])

        return result

    except ImportError as e:
        raise HTTPException(503, detail=f"SimuGeneTrials engine not available: {e}")
    finally:
        if str(SIMUGENE_DIR) in sys.path:
            sys.path.remove(str(SIMUGENE_DIR))
