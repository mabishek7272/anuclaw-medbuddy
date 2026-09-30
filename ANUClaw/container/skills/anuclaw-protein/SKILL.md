# ANUClaw Protein Structure & Design Suite

Protein structure prediction, design, and analysis: AlphaFold, RFDiffusion, ProteinMPNN, ESM, FoldSeek, antibody design, binder design.

## When to Use
- Protein structure prediction or retrieval (PDB, AlphaFold DB)
- De novo protein design
- Antibody design or optimisation (MAGE, AbDesign)
- Binder design (BindCraft, RFDiffusion)
- Protein language model embeddings (ESM)
- Structural similarity search (FoldSeek)
- PyMOL rendering and structural analysis

## Capabilities

### PDB Structure Retrieval + PyMOL Rendering
```python
import requests

def fetch_pdb_structure(pdb_id, output_dir="/workspace/output"):
    url = f"https://files.rcsb.org/download/{pdb_id}.pdb"
    res = requests.get(url)
    path = f"{output_dir}/{pdb_id}.pdb"
    with open(path, "w") as f:
        f.write(res.text)
    return path

def render_protein_pymol(pdb_path, output_path="/workspace/output/structure.png",
                          representation="cartoon", color_scheme="rainbow"):
    """Render protein structure using PyMOL."""
    import subprocess
    pymol_script = f"""
load {pdb_path}
bg_color white
set ray_opaque_background, 0
as {representation}
spectrum {color_scheme}
set ray_shadows, 0
ray 1200, 900
png {output_path}
quit
"""
    script_path = "/tmp/render.pml"
    with open(script_path, "w") as f:
        f.write(pymol_script)
    subprocess.run(["pymol", "-c", script_path], capture_output=True)
    return output_path

def analyze_hydrogen_bonds(pdb_path, ligand_chain="L", protein_chain="A"):
    """Analyse H-bonds between ligand and protein."""
    pymol_script = f"""
load {pdb_path}
select ligand, chain {ligand_chain}
select protein, chain {protein_chain}
find_polar_contacts ligand, protein, 3.5
save /workspace/output/hbond_analysis.pse
quit
"""
    import subprocess
    with open("/tmp/hbond.pml", "w") as f:
        f.write(pymol_script)
    subprocess.run(["pymol", "-c", "/tmp/hbond.pml"], capture_output=True)
```

### AlphaFold Structure Prediction
```python
import requests

def get_alphafold_structure(uniprot_id):
    """Retrieve pre-computed AlphaFold structure from EBI database."""
    url = f"https://alphafold.ebi.ac.uk/files/AF-{uniprot_id}-F1-model_v4.pdb"
    res = requests.get(url)
    if res.status_code == 200:
        path = f"/workspace/output/AF_{uniprot_id}.pdb"
        with open(path, "w") as f:
            f.write(res.text)
        return path
    return None

def get_alphafold_confidence(uniprot_id):
    """Get pLDDT confidence scores for AlphaFold model."""
    url = f"https://alphafold.ebi.ac.uk/api/prediction/{uniprot_id}"
    res = requests.get(url)
    return res.json()
```

### ESM Protein Language Model
```python
import torch
import esm

def get_esm_embeddings(sequences):
    """Generate ESM-2 protein embeddings for downstream ML tasks."""
    model, alphabet = esm.pretrained.esm2_t33_650M_UR50D()
    batch_converter = alphabet.get_batch_converter()
    model.eval()

    data = [(f"seq_{i}", seq) for i, seq in enumerate(sequences)]
    _, _, batch_tokens = batch_converter(data)

    with torch.no_grad():
        results = model(batch_tokens, repr_layers=[33], return_contacts=True)
    
    embeddings = results["representations"][33]
    return embeddings.numpy()

def predict_secondary_structure(sequence):
    """Predict secondary structure using ESM."""
    model, alphabet = esm.pretrained.esmfold_v1()
    model.eval()
    with torch.no_grad():
        output = model.infer_pdb(sequence)
    return output  # PDB format string
```

### FoldSeek Structural Search
```python
import requests

def foldseek_search(pdb_path, database="pdb100", mode="3diaa"):
    """Search for structurally similar proteins using FoldSeek API."""
    with open(pdb_path, "rb") as f:
        files = {"q": f}
        res = requests.post(
            "https://search.foldseek.com/api/ticket",
            data={"database[]": database, "mode": mode},
            files=files,
        )
    ticket = res.json()["id"]
    
    # Poll for results
    import time
    while True:
        status = requests.get(f"https://search.foldseek.com/api/ticket/{ticket}").json()
        if status["status"] == "COMPLETE":
            return requests.get(f"https://search.foldseek.com/api/result/{ticket}/0").json()
        time.sleep(2)
```

### ProteinMPNN Sequence Design
```python
def design_sequence_for_backbone(pdb_path, chains_to_design="A", num_seqs=8, temperature=0.1):
    """
    Run ProteinMPNN to design protein sequences for a given backbone structure.
    Requires ProteinMPNN installation at /opt/ProteinMPNN/
    """
    import subprocess
    cmd = [
        "python", "/opt/ProteinMPNN/protein_mpnn_run.py",
        "--pdb_path", pdb_path,
        "--pdb_path_chains", chains_to_design,
        "--out_folder", "/workspace/output/proteinmpnn",
        "--num_seq_per_target", str(num_seqs),
        "--sampling_temp", str(temperature),
        "--seed", "42",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.stdout
```

### Antibody Design (MAGE)
```python
def antibody_humanisation_score(vh_sequence, vl_sequence):
    """Calculate humanisation score for antibody VH/VL sequences."""
    from Bio import pairwise2
    # Compare against human germline sequences
    human_vh_germline = "EVQLVESGGGLVQPGGSLRLSCAASGFTFSSYAMSWVRQAPGKGLEWVSAISGSGGSTYYADSVKGRFTISRDNSKNTLYLQMNSLRAEDTAVYYCAR"
    score_h = pairwise2.align.globalxx(vh_sequence, human_vh_germline)[0].score
    humanisation = score_h / max(len(vh_sequence), len(human_vh_germline))
    return {"vh_humanisation": round(humanisation, 3), "classification": "humanised" if humanisation > 0.85 else "chimeric"}
```

## Available Structure Databases
- RCSB PDB (all deposited structures)
- AlphaFold Database (200M+ predicted structures)
- SIFTS (PDB-UniProt mapping)
- FoldSeek structural search
- PDBe-KB (biological context)
