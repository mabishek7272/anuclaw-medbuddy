"""
ClinVar Variant Router
Real clinical significance data: pathogenicity, star ratings,
clinical evidence, submitter notes — all from NCBI ClinVar.
"""

import json
import tempfile
import subprocess
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

CLINVAR_SCRIPT = Path(__file__).parent.parent / "scripts" / "clinvar_api.py"


def run_clinvar(args: list[str]) -> dict:
    """Execute the ClinVar skill script and return parsed JSON."""
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w") as f:
        out_path = f.name

    cmd = ["uv", "run", str(CLINVAR_SCRIPT)] + args + ["--output", out_path]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        raise HTTPException(500, detail=f"ClinVar error: {result.stderr[:500]}")

    with open(out_path) as f:
        data = json.load(f)
    Path(out_path).unlink(missing_ok=True)
    return data


@router.get("/search")
def search_variants(
    gene: str = Query(None, description="Gene symbol e.g. BRCA1, TP53"),
    condition: str = Query(None, description="Disease/condition"),
    significance: str = Query(None, description="pathogenic, benign, uncertain+significance"),
    limit: int = Query(50, le=500),
):
    """Search ClinVar for variants by gene, condition, or clinical significance."""
    parts = []
    if gene:
        parts.append(f"{gene}[gene]")
    if condition:
        parts.append(f'"{condition}"[condition]')
    if significance:
        parts.append(f'"{significance}"[clinsig]')

    if not parts:
        raise HTTPException(400, detail="Provide at least one of: gene, condition, significance")

    query = " AND ".join(parts)

    # Count first
    count_data = run_clinvar(["count", "--query", query])
    total = count_data.get("total_count", 0)

    if total == 0:
        return {"total": 0, "variants": [], "query": query}

    # Search
    search_data = run_clinvar(["search", "--query", query, "--retmax", str(min(limit, 200))])
    variant_ids = search_data.get("variant_ids", [])

    if not variant_ids:
        return {"total": total, "variants": [], "query": query}

    # Get summaries (batch up to 50 at a time)
    batch = variant_ids[:50]
    summary_data = run_clinvar(["summary", "--variant_ids"] + [str(v) for v in batch])
    summaries = summary_data if isinstance(summary_data, list) else []

    return {
        "total": total,
        "fetched": len(summaries),
        "query": query,
        "variants": [
            {
                "variant_id": s.get("variant_id"),
                "title": s.get("title"),
                "clinical_significance": s.get("clinical_significance"),
                "review_status": s.get("review_status"),
                "last_evaluated": s.get("last_evaluated"),
                "genes": s.get("genes", []),
                "phenotypes": s.get("phenotypes", []),
                "variation_type": s.get("variation_type"),
                "molecular_consequences": s.get("molecular_consequences", []),
            }
            for s in summaries
        ],
    }


@router.get("/{variant_id}")
def get_variant_evidence(variant_id: str):
    """Get full clinical evidence for a ClinVar variant ID."""
    data = run_clinvar(["evidence", "--variant_id", variant_id])
    return {
        "variant_id": data.get("variant_id"),
        "allele_info": data.get("allele_info"),
        "conditions": data.get("conditions", []),
        "functional_consequences": data.get("functional_consequences", []),
        "citation_references": data.get("citation_references", []),
        "submissions": [
            {
                "submitter": s.get("submitter_name"),
                "classification": s.get("classification"),
                "curator_notes": s.get("curator_notes"),
                "assertion_criteria": s.get("assertion_criteria"),
                "date_last_evaluated": s.get("date_last_evaluated"),
            }
            for s in data.get("submissions", [])
        ],
    }


@router.get("/{variant_id}/summary")
def get_variant_summary(variant_id: str):
    """Get rapid clinical significance summary for a single variant."""
    data = run_clinvar(["summary", "--variant_ids", variant_id])
    summaries = data if isinstance(data, list) else []
    if not summaries:
        raise HTTPException(404, detail=f"Variant {variant_id} not found in ClinVar")
    return summaries[0]
