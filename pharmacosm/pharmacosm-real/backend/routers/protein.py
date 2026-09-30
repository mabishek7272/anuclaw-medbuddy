"""
Protein Structure & Expression Router
Real data from AlphaFold EBI (pLDDT, domain analysis)
and Human Protein Atlas (tissue expression, subcellular location).
"""

import json
import tempfile
import subprocess
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

ALPHAFOLD_FETCH = Path(__file__).parent.parent / "scripts" / "alphafold" / "fetch_structure.py"
ALPHAFOLD_PLDDT = Path(__file__).parent.parent / "scripts" / "alphafold" / "analyze_plddt.py"
ALPHAFOLD_PAE = Path(__file__).parent.parent / "scripts" / "alphafold" / "analyze_pae.py"
HPA_SCRIPT = Path(__file__).parent.parent / "scripts" / "hpa_cli.py"

# Cache dir for AlphaFold files
AF_CACHE = Path(__file__).parent.parent / "af_cache"
AF_CACHE.mkdir(exist_ok=True)


def run_alphafold_fetch(uniprot_id: str) -> Path:
    """Fetch AlphaFold structure files. Returns the output directory."""
    out_dir = AF_CACHE / uniprot_id
    out_dir.mkdir(exist_ok=True)

    # Check if already cached
    metadata_files = list(out_dir.glob("*-metadata.json"))
    if metadata_files:
        return out_dir

    cmd = ["uv", "run", str(ALPHAFOLD_FETCH), uniprot_id, "-o", str(out_dir)]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        raise HTTPException(500, detail=f"AlphaFold fetch error: {result.stderr[:400]}")
    return out_dir


def run_hpa(args: list[str]) -> dict:
    """Execute the HPA skill script."""
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w") as f:
        out_path = f.name

    cmd = ["uv", "run", str(HPA_SCRIPT)] + args + ["--output", out_path]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise HTTPException(500, detail=f"HPA error: {result.stderr[:400]}")

    with open(out_path) as f:
        data = json.load(f)
    Path(out_path).unlink(missing_ok=True)
    return data


@router.get("/{uniprot_id}/structure")
def get_protein_structure(uniprot_id: str):
    """
    Fetch and analyze AlphaFold predicted structure for a UniProt protein.
    Returns pLDDT confidence scores and domain boundary analysis.
    """
    uniprot_id = uniprot_id.upper()
    out_dir = run_alphafold_fetch(uniprot_id)

    # Find metadata file
    metadata_files = list(out_dir.glob("*-metadata.json"))
    pae_files = list(out_dir.glob("*predicted_aligned_error*.json"))

    if not metadata_files:
        raise HTTPException(404, detail=f"No AlphaFold structure found for {uniprot_id}")

    metadata_path = metadata_files[0]

    # Read metadata
    with open(metadata_path) as f:
        metadata = json.load(f)

    # Analyze pLDDT
    plddt_result = subprocess.run(
        ["uv", "run", str(ALPHAFOLD_PLDDT), str(metadata_path)],
        capture_output=True, text=True, timeout=30
    )
    plddt_analysis = plddt_result.stdout

    # Analyze PAE / domains
    pae_analysis = None
    if pae_files:
        pae_result = subprocess.run(
            ["uv", "run", str(ALPHAFOLD_PAE), str(pae_files[0])],
            capture_output=True, text=True, timeout=30
        )
        pae_analysis = pae_result.stdout

    # Extract pLDDT per-residue scores from metadata
    plddt_scores = []
    if isinstance(metadata, dict):
        plddt_scores = metadata.get("plddt", [])
    elif isinstance(metadata, list) and len(metadata) > 0:
        plddt_scores = metadata[0].get("plddt", [])

    # Compute summary statistics
    if plddt_scores:
        scores = [float(s) for s in plddt_scores]
        avg_plddt = sum(scores) / len(scores)
        very_high = sum(1 for s in scores if s >= 90) / len(scores)
        high = sum(1 for s in scores if 70 <= s < 90) / len(scores)
        low = sum(1 for s in scores if 50 <= s < 70) / len(scores)
        very_low = sum(1 for s in scores if s < 50) / len(scores)
    else:
        avg_plddt = None
        very_high = high = low = very_low = None
        scores = []

    return {
        "uniprot_id": uniprot_id,
        "model_id": metadata_files[0].stem.replace("-metadata", ""),
        "sequence_length": len(scores) if scores else None,
        "plddt": {
            "per_residue": scores[:500] if scores else [],  # limit for API response size
            "average": round(avg_plddt, 2) if avg_plddt else None,
            "fraction_very_high": round(very_high, 3) if very_high is not None else None,
            "fraction_high": round(high, 3) if high is not None else None,
            "fraction_low": round(low, 3) if low is not None else None,
            "fraction_very_low": round(very_low, 3) if very_low is not None else None,
        },
        "plddt_analysis_text": plddt_analysis,
        "domain_analysis_text": pae_analysis,
        "structure_files": {
            "cif_available": len(list(out_dir.glob("*.cif"))) > 0,
            "pae_available": len(pae_files) > 0,
        },
    }


@router.get("/{gene_symbol}/expression")
def get_protein_expression(
    gene_symbol: str,
    tissues: str = Query(None, description="Comma-separated tissue names to filter"),
):
    """
    Get tissue-level protein expression for a gene from Human Protein Atlas.
    Returns IHC-based expression: High, Medium, Low, Not Detected per tissue.
    """
    gene_symbol = gene_symbol.upper()

    # Step 1: Resolve gene symbol → Ensembl ID
    id_data = run_hpa(["resolve-ensembl-id", gene_symbol])
    ensembl_id = id_data.get("ensembl_id") or id_data.get("id")
    if not ensembl_id:
        raise HTTPException(404, detail=f"Could not resolve Ensembl ID for gene {gene_symbol}")

    # Step 2: Get tissue expression
    args = ["get-tissue-expression", ensembl_id]
    if tissues:
        args += ["--tissues", tissues]

    expr_data = run_hpa(args)
    tissue_data = expr_data.get("tissue_expression", expr_data.get("data", []))

    return {
        "gene_symbol": gene_symbol,
        "ensembl_id": ensembl_id,
        "data_source": "Human Protein Atlas (IHC)",
        "tissue_count": len(tissue_data),
        "expression": tissue_data,
    }


@router.get("/{gene_symbol}/location")
def get_subcellular_location(gene_symbol: str):
    """
    Get subcellular protein location from Human Protein Atlas.
    Returns organelles where the protein is localized (e.g., nucleus, cytoplasm).
    """
    gene_symbol = gene_symbol.upper()

    # Resolve to Ensembl ID
    id_data = run_hpa(["resolve-ensembl-id", gene_symbol])
    ensembl_id = id_data.get("ensembl_id") or id_data.get("id")
    if not ensembl_id:
        raise HTTPException(404, detail=f"Could not resolve Ensembl ID for gene {gene_symbol}")

    # Get subcellular location
    loc_data = run_hpa(["get-subcellular-location", ensembl_id])

    return {
        "gene_symbol": gene_symbol,
        "ensembl_id": ensembl_id,
        "data_source": "Human Protein Atlas",
        "locations": loc_data.get("subcellular_locations", loc_data.get("locations", [])),
        "reliability": loc_data.get("reliability"),
    }


@router.get("/{gene_symbol}/full")
def get_full_protein_profile(gene_symbol: str):
    """
    Combined endpoint: HPA expression + subcellular location in one call.
    """
    gene_symbol = gene_symbol.upper()

    id_data = run_hpa(["resolve-ensembl-id", gene_symbol])
    ensembl_id = id_data.get("ensembl_id") or id_data.get("id")
    if not ensembl_id:
        raise HTTPException(404, detail=f"Could not resolve Ensembl ID for {gene_symbol}")

    expr_data = run_hpa(["get-tissue-expression", ensembl_id])
    loc_data = run_hpa(["get-subcellular-location", ensembl_id])

    tissue_data = expr_data.get("tissue_expression", expr_data.get("data", []))
    locations = loc_data.get("subcellular_locations", loc_data.get("locations", []))

    return {
        "gene_symbol": gene_symbol,
        "ensembl_id": ensembl_id,
        "tissue_expression": tissue_data,
        "subcellular_locations": locations,
        "reliability": loc_data.get("reliability"),
        "data_source": "Human Protein Atlas (IHC)",
    }
