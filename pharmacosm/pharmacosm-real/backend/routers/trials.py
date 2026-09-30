"""
ClinicalTrials.gov Router
Real, live clinical trial data: search by condition, drug, phase, status.
"""

import json
import tempfile
import subprocess
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from typing import Optional

router = APIRouter()

CT_SCRIPT = Path(__file__).parent.parent / "scripts" / "clinical_trials_api.py"


def run_ct(args: list[str]) -> dict:
    """Execute the ClinicalTrials.gov skill script."""
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w") as f:
        out_path = f.name

    cmd = ["uv", "run", str(CT_SCRIPT)] + args + ["--output", out_path]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise HTTPException(500, detail=f"ClinicalTrials error: {result.stderr[:500]}")

    with open(out_path) as f:
        data = json.load(f)
    Path(out_path).unlink(missing_ok=True)
    return data


@router.get("/search")
def search_trials(
    condition: Optional[str] = Query(None, description="Disease or condition"),
    intervention: Optional[str] = Query(None, description="Drug or treatment"),
    status: Optional[str] = Query(None, description="RECRUITING, COMPLETED, etc."),
    phase: Optional[str] = Query(None, description="PHASE1, PHASE2, PHASE3, PHASE4"),
    age_group: Optional[str] = Query(None, description="CHILD, ADULT, OLDER_ADULT"),
    sponsor: Optional[str] = Query(None, description="Sponsor or institution"),
    limit: int = Query(20, le=100),
):
    """Search ClinicalTrials.gov for real clinical trials."""
    if not any([condition, intervention, sponsor]):
        raise HTTPException(400, detail="Provide at least one of: condition, intervention, sponsor")

    args = [
        "search",
        "--fields", "NCTId,BriefTitle,OverallStatus,Phase,BriefSummary,ConditionsModule,ArmsInterventionsModule,EligibilityModule,LeadSponsorName,StartDate,PrimaryCompletionDate",
        "--limit", str(limit),
        "--count-total",
    ]
    if condition:
        args += ["--condition", condition]
    if intervention:
        args += ["--intervention", intervention]
    if status:
        args += ["--status", status]
    if phase:
        args += ["--phase", phase]
    if age_group:
        args += ["--age-group", age_group]
    if sponsor:
        args += ["--sponsor", sponsor]

    data = run_ct(args)
    studies = data.get("studies", [])

    def _extract(study: dict) -> dict:
        ps = study.get("protocolSection", {})
        id_mod = ps.get("identificationModule", {})
        status_mod = ps.get("statusModule", {})
        desc_mod = ps.get("descriptionModule", {})
        cond_mod = ps.get("conditionsModule", {})
        arms_mod = ps.get("armsInterventionsModule", {})
        elig_mod = ps.get("eligibilityModule", {})
        sponsor_mod = ps.get("sponsorCollaboratorsModule", {})

        interventions = arms_mod.get("interventions", [])
        return {
            "nct_id": id_mod.get("nctId"),
            "title": id_mod.get("briefTitle"),
            "status": status_mod.get("overallStatus"),
            "phase": ps.get("designModule", {}).get("phases", []),
            "summary": desc_mod.get("briefSummary", "")[:400],
            "conditions": cond_mod.get("conditions", []),
            "interventions": [
                {"type": i.get("type"), "name": i.get("name")}
                for i in interventions
            ],
            "eligibility": {
                "criteria_snippet": (elig_mod.get("eligibilityCriteria", "")[:300] + "...") if elig_mod.get("eligibilityCriteria") else None,
                "age_groups": elig_mod.get("stdAges", []),
                "sex": elig_mod.get("sex"),
                "min_age": elig_mod.get("minimumAge"),
                "max_age": elig_mod.get("maximumAge"),
            },
            "lead_sponsor": (sponsor_mod.get("leadSponsor") or {}).get("name"),
        }

    return {
        "total": data.get("totalCount", len(studies)),
        "returned": len(studies),
        "trials": [_extract(s) for s in studies],
    }


@router.get("/{nct_id}")
def get_trial(nct_id: str):
    """Get full trial details by NCT ID."""
    data = run_ct(["get-study", nct_id])
    ps = data.get("protocolSection", {})
    id_mod = ps.get("identificationModule", {})
    status_mod = ps.get("statusModule", {})
    desc_mod = ps.get("descriptionModule", {})
    cond_mod = ps.get("conditionsModule", {})
    arms_mod = ps.get("armsInterventionsModule", {})
    elig_mod = ps.get("eligibilityModule", {})
    sponsor_mod = ps.get("sponsorCollaboratorsModule", {})
    outcomes_mod = ps.get("outcomesModule", {})
    contacts_mod = ps.get("contactsLocationsModule", {})

    return {
        "nct_id": id_mod.get("nctId"),
        "title": id_mod.get("briefTitle"),
        "official_title": id_mod.get("officialTitle"),
        "status": status_mod.get("overallStatus"),
        "start_date": status_mod.get("startDateStruct", {}).get("date"),
        "completion_date": status_mod.get("primaryCompletionDateStruct", {}).get("date"),
        "summary": desc_mod.get("briefSummary"),
        "detailed_description": desc_mod.get("detailedDescription"),
        "conditions": cond_mod.get("conditions", []),
        "interventions": [
            {
                "type": i.get("type"),
                "name": i.get("name"),
                "description": i.get("description"),
            }
            for i in arms_mod.get("interventions", [])
        ],
        "arms": [
            {
                "label": a.get("label"),
                "type": a.get("type"),
                "description": a.get("description"),
            }
            for a in arms_mod.get("armGroups", [])
        ],
        "eligibility": {
            "criteria": elig_mod.get("eligibilityCriteria"),
            "age_groups": elig_mod.get("stdAges", []),
            "sex": elig_mod.get("sex"),
            "min_age": elig_mod.get("minimumAge"),
            "max_age": elig_mod.get("maximumAge"),
            "healthy_volunteers": elig_mod.get("healthyVolunteers"),
        },
        "primary_outcomes": [
            {"measure": o.get("measure"), "time_frame": o.get("timeFrame")}
            for o in outcomes_mod.get("primaryOutcomes", [])
        ],
        "lead_sponsor": (sponsor_mod.get("leadSponsor") or {}).get("name"),
        "collaborators": [c.get("name") for c in sponsor_mod.get("collaborators", [])],
        "locations": [
            {
                "facility": loc.get("facility"),
                "city": loc.get("city"),
                "country": loc.get("country"),
                "status": loc.get("status"),
            }
            for loc in contacts_mod.get("locations", [])[:20]
        ],
    }


@router.get("/{nct_id}/eligibility")
def get_eligibility(nct_id: str):
    """Get eligibility criteria for a specific trial."""
    data = run_ct(["get-eligibility", nct_id])
    ps = (data.get("protocolSection") or {})
    id_mod = ps.get("identificationModule", {})
    elig_mod = ps.get("eligibilityModule", {})
    return {
        "nct_id": nct_id,
        "title": id_mod.get("briefTitle"),
        "criteria": elig_mod.get("eligibilityCriteria"),
        "age_groups": elig_mod.get("stdAges", []),
        "min_age": elig_mod.get("minimumAge"),
        "max_age": elig_mod.get("maximumAge"),
        "sex": elig_mod.get("sex"),
        "healthy_volunteers": elig_mod.get("healthyVolunteers"),
    }
