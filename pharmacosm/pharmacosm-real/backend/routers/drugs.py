"""
ChEMBL Drug Router
Real drug data: molecules, bioactivity, mechanisms, images, similarity search.
All data sourced live from the ChEMBL REST API.
"""

import json
import tempfile
import subprocess
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

router = APIRouter()

CHEMBL_SCRIPT = Path(__file__).parent.parent / "scripts" / "chembl_api.py"


def run_chembl(args: list[str]) -> dict:
    """Execute the ChEMBL skill script and return parsed JSON output."""
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w") as f:
        out_path = f.name

    cmd = ["uv", "run", str(CHEMBL_SCRIPT)] + args + ["--output", out_path]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise HTTPException(500, detail=f"ChEMBL error: {result.stderr[:500]}")

    with open(out_path) as f:
        data = json.load(f)
    Path(out_path).unlink(missing_ok=True)
    return data


@router.get("/search")
def search_drugs(q: str = Query(..., min_length=2, description="Drug name or keyword")):
    """Search ChEMBL for drugs/molecules by name."""
    data = run_chembl(["molecule", "--search", q, "--limit", "15"])
    molecules = data.get("molecules", [])
    results = []
    for mol in molecules:
        props = mol.get("molecule_properties") or {}
        results.append({
            "chembl_id": mol.get("molecule_chembl_id"),
            "name": mol.get("pref_name") or mol.get("molecule_chembl_id"),
            "molecular_formula": mol.get("molecule_properties", {}).get("full_molformula") if mol.get("molecule_properties") else None,
            "mw": props.get("full_mw"),
            "max_phase": mol.get("max_phase"),
            "molecule_type": mol.get("molecule_type"),
            "oral": mol.get("oral"),
            "prodrug": mol.get("prodrug"),
            "smiles": mol.get("molecule_structures", {}).get("canonical_smiles") if mol.get("molecule_structures") else None,
        })
    return {"results": results, "total": len(results), "query": q}


@router.get("/{chembl_id}")
def get_drug(chembl_id: str):
    """Get full ChEMBL drug details by ID (e.g. CHEMBL25)."""
    mol_data = run_chembl(["molecule", "--id", chembl_id])
    mol = mol_data if not isinstance(mol_data, list) else mol_data[0]

    # Get mechanism of action
    try:
        mech_data = run_chembl(["mechanism", "--filter", f"molecule_chembl_id={chembl_id}", "--limit", "10"])
        mechanisms = mech_data.get("mechanisms", [])
    except Exception:
        mechanisms = []

    # Get drug indications
    try:
        ind_data = run_chembl(["drug_indication", "--filter", f"molecule_chembl_id={chembl_id}", "--limit", "20"])
        indications = ind_data.get("drug_indications", [])
    except Exception:
        indications = []

    # Get drug warnings
    try:
        warn_data = run_chembl(["drug_warning", "--filter", f"molecule_chembl_id={chembl_id}", "--limit", "10"])
        warnings = warn_data.get("drug_warnings", [])
    except Exception:
        warnings = []

    props = mol.get("molecule_properties") or {}
    return {
        "chembl_id": mol.get("molecule_chembl_id"),
        "name": mol.get("pref_name"),
        "molecule_type": mol.get("molecule_type"),
        "max_phase": mol.get("max_phase"),
        "oral": mol.get("oral"),
        "prodrug": mol.get("prodrug"),
        "first_approval": mol.get("first_approval"),
        "properties": {
            "mw": props.get("full_mw"),
            "alogp": props.get("alogp"),
            "hba": props.get("hba"),
            "hbd": props.get("hbd"),
            "num_ro5_violations": props.get("num_ro5_violations"),
            "molecular_formula": props.get("full_molformula"),
            "psa": props.get("psa"),
            "rtb": props.get("rtb"),
        },
        "smiles": (mol.get("molecule_structures") or {}).get("canonical_smiles"),
        "inchi_key": (mol.get("molecule_structures") or {}).get("standard_inchi_key"),
        "mechanisms": [
            {
                "action_type": m.get("action_type"),
                "mechanism_of_action": m.get("mechanism_of_action"),
                "target_chembl_id": m.get("target_chembl_id"),
                "target_name": m.get("target_name"),
            }
            for m in mechanisms
        ],
        "indications": [
            {
                "indication": i.get("indication"),
                "mesh_heading": i.get("mesh_heading"),
                "max_phase_for_ind": i.get("max_phase_for_ind"),
                "efo_term": i.get("efo_term"),
            }
            for i in indications
        ],
        "warnings": [
            {
                "warning_type": w.get("warning_type"),
                "warning_class": w.get("warning_class"),
                "description": w.get("description"),
                "country": w.get("country"),
                "year": w.get("year"),
            }
            for w in warnings
        ],
    }


@router.get("/{chembl_id}/bioactivity")
def get_bioactivity(
    chembl_id: str,
    standard_type: str = Query("IC50", description="IC50, Ki, EC50, etc."),
    limit: int = Query(20, le=100),
):
    """Get normalized bioactivity data for a drug from ChEMBL."""
    data = run_chembl([
        "activity",
        "--filter", f"molecule_chembl_id={chembl_id}",
        "--filter", f"standard_type={standard_type}",
        "--normalize",
        "--limit", str(limit),
    ])
    activities = data.get("activities", [])
    return {
        "chembl_id": chembl_id,
        "standard_type": standard_type,
        "count": len(activities),
        "activities": [
            {
                "activity_id": a.get("activity_id"),
                "target_name": a.get("target_name"),
                "target_chembl_id": a.get("target_chembl_id"),
                "assay_description": a.get("assay_description"),
                "standard_value": a.get("standard_value"),
                "standard_units": a.get("standard_units"),
                "normalized_value_nm": a.get("normalized_value_nM"),
                "normalization_note": a.get("normalization_note"),
                "pchembl_value": a.get("pchembl_value"),
                "document_year": a.get("document_year"),
            }
            for a in activities
        ],
    }


@router.get("/{chembl_id}/image")
def get_drug_image(chembl_id: str, size: int = Query(300, le=500)):
    """Return 2D compound structure image (SVG) from ChEMBL."""
    with tempfile.NamedTemporaryFile(suffix=".svg", delete=False) as f:
        out_path = f.name

    cmd = ["uv", "run", str(CHEMBL_SCRIPT), "image", "--id", chembl_id,
           "--dimensions", str(size), "--img_format", "svg", "--output", out_path]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    if result.returncode != 0:
        raise HTTPException(404, detail="Image not available")

    svg_content = Path(out_path).read_text()
    Path(out_path).unlink(missing_ok=True)
    return Response(content=svg_content, media_type="image/svg+xml")


@router.get("/{chembl_id}/similar")
def get_similar_drugs(chembl_id: str, threshold: int = Query(80, ge=40, le=100)):
    """Find structurally similar compounds in ChEMBL."""
    # Get SMILES first
    mol_data = run_chembl(["molecule", "--id", chembl_id])
    smiles = (mol_data.get("molecule_structures") or {}).get("canonical_smiles")
    if not smiles:
        raise HTTPException(404, detail="No structure available for this molecule")

    data = run_chembl(["similarity", "--smiles", smiles, "--similarity", str(threshold), "--limit", "10"])
    similar = data.get("molecules", [])
    return {
        "source_id": chembl_id,
        "similarity_threshold": threshold,
        "results": [
            {
                "chembl_id": m.get("molecule_chembl_id"),
                "name": m.get("pref_name"),
                "similarity": m.get("similarity"),
                "max_phase": m.get("max_phase"),
                "smiles": (m.get("molecule_structures") or {}).get("canonical_smiles"),
            }
            for m in similar
        ],
    }
