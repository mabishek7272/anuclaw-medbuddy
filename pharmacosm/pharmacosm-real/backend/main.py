"""
PharmaCosm Real — FastAPI Backend
Serves real biomedical data from ChEMBL, ClinVar, ClinicalTrials.gov,
AlphaFold EBI, and Human Protein Atlas.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import drugs, variants, trials, protein, simulation

app = FastAPI(
    title="PharmaCosm Real API",
    description="Real biomedical data from ChEMBL, ClinVar, ClinicalTrials.gov, AlphaFold, HPA",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(drugs.router, prefix="/api/drugs", tags=["Drugs (ChEMBL)"])
app.include_router(variants.router, prefix="/api/variants", tags=["Variants (ClinVar)"])
app.include_router(trials.router, prefix="/api/trials", tags=["Trials (ClinicalTrials.gov)"])
app.include_router(protein.router, prefix="/api/protein", tags=["Protein (AlphaFold + HPA)"])
app.include_router(simulation.router, prefix="/api/simulate", tags=["Virtual Trial Simulation"])


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0"}
