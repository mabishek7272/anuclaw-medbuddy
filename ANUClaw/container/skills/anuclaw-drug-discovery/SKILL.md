# ANUClaw Drug Discovery Suite

Computational drug discovery workflows: cheminformatics, docking, ADMET, QSAR, virtual screening, target intelligence, and database queries.

## When to Use
- User asks about drug compounds, molecules, SMILES, InChI
- Molecular docking, binding affinity, protein-ligand interaction
- ADMET properties (absorption, distribution, metabolism, excretion, toxicity)
- Drug databases: DrugBank, ChEMBL, PubChem, BindingDB
- Virtual screening, lead optimisation, drug repurposing

## ⚠️ Capability Boundary
Docking scores, QSAR predictions, and ADMET heuristics are **prioritisation signals only** — not experimental proof. Always advise wet-lab validation.

## Capabilities

### Cheminformatics (Python / RDKit)
```python
from rdkit import Chem
from rdkit.Chem import Draw, Descriptors, AllChem
from rdkit.Chem.Draw import IPythonConsole
import datamol as dm

# Parse and validate SMILES
mol = Chem.MolFromSmiles('CC(=O)Oc1ccccc1C(=O)O')  # Aspirin
print(f"Valid: {mol is not None}")
print(f"MW: {Descriptors.MolWt(mol):.2f}")
print(f"LogP: {Descriptors.MolLogP(mol):.2f}")
print(f"HBD: {Descriptors.NumHDonors(mol)}, HBA: {Descriptors.NumHAcceptors(mol)}")

# Draw molecule
img = Draw.MolToImage(mol, size=(400, 300))
img.save('/workspace/output/molecule.png')
```

### ADMET Prediction (Python)
```python
from molfeat.calc import FPCalculator
from pytdc.single_pred import ADME
import numpy as np

# Lipinski Rule of Five (quick ADMET screening)
def lipinski_check(smiles):
    mol = Chem.MolFromSmiles(smiles)
    if not mol:
        return None
    return {
        'MW': Descriptors.MolWt(mol) <= 500,
        'LogP': Descriptors.MolLogP(mol) <= 5,
        'HBD': Descriptors.NumHDonors(mol) <= 5,
        'HBA': Descriptors.NumHAcceptors(mol) <= 10,
        'passes_ro5': all([
            Descriptors.MolWt(mol) <= 500,
            Descriptors.MolLogP(mol) <= 5,
            Descriptors.NumHDonors(mol) <= 5,
            Descriptors.NumHAcceptors(mol) <= 10,
        ])
    }
```

### Molecular Docking
```bash
# AutoDock Vina
vina --receptor receptor.pdbqt \
     --ligand ligand.pdbqt \
     --center_x 10.5 --center_y 20.3 --center_z 15.1 \
     --size_x 25 --size_y 25 --size_z 25 \
     --out docking_results.pdbqt \
     --log docking.log
```

### Database Queries (Python)
```python
import requests

# PubChem
def search_pubchem(compound_name):
    url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{compound_name}/JSON"
    res = requests.get(url)
    return res.json()

# ChEMBL
def search_chembl(molecule_name):
    url = f"https://www.ebi.ac.uk/chembl/api/data/molecule?pref_name__icontains={molecule_name}&format=json"
    res = requests.get(url)
    return res.json()

# BindingDB
def search_bindingdb(target_name):
    url = f"https://www.bindingdb.org/axis2/services/BDBService/getLigandsByTarget?targetName={target_name}&response=json"
    res = requests.get(url)
    return res.json()
```

### Target Intelligence (Python)
```python
import requests

# OpenTargets — disease-gene associations
def get_target_associations(gene_name):
    query = """
    query targetAssociations($ensemblId: String!) {
      target(ensemblId: $ensemblId) {
        id approvedName
        associatedDiseases(page: {index: 0, size: 10}) {
          rows { disease { name id } score }
        }
      }
    }
    """
    res = requests.post(
        "https://api.platform.opentargets.org/api/v4/graphql",
        json={"query": query, "variables": {"ensemblId": gene_name}},
    )
    return res.json()

# UniProt protein info
def get_uniprot(accession):
    url = f"https://rest.uniprot.org/uniprotkb/{accession}.json"
    return requests.get(url).json()
```

### Virtual Screening Pipeline
```python
# 1. Load compound library
from rdkit.Chem import SDMolSupplier
supplier = SDMolSupplier('compound_library.sdf')
mols = [m for m in supplier if m]

# 2. Filter by drug-likeness (Lipinski)
druglike = [m for m in mols if lipinski_check(Chem.MolToSmiles(m))['passes_ro5']]

# 3. Generate 3D conformers for docking
from rdkit.Chem import AllChem
for i, mol in enumerate(druglike[:100]):  # Top 100
    mol = Chem.AddHs(mol)
    AllChem.EmbedMolecule(mol, AllChem.ETKDGv3())
    # Convert to pdbqt and dock...
```

## Databases Accessible
- PubChem, ChEMBL, BindingDB, DrugBank
- OpenTargets, Reactome, STRING
- openFDA, ClinicalTrials.gov
- ZINC, COCONUT (natural products)
