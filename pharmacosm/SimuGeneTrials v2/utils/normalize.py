# utils/normalize.py
import json, os

GENE_ALIAS = {
    "HRD": ["BRCA1","BRCA2","RAD51","PALB2","ATM"],
    "MMR": ["MLH1","MSH2","MSH6","PMS2"],
    "MSI-H": ["MLH1","MSH2","MSH6","PMS2"], "MSI": ["MLH1","MSH2","MSH6","PMS2"]
}

PATHWAY_GENE_SETS = {
    "HR":{"BRCA1","BRCA2","RAD51","PALB2","ATM"},
    "MMR":{"MLH1","MSH2","MSH6","PMS2"},
    "NER":{"ERCC1","XPA","XPC"},
    "BER":{"OGG1","TDG","PARP1","PARP2"},
    "NHEJ":{"PRKDC","XRCC5","XRCC6"}
}

def load_json(p): 
    with open(p,"r",encoding="utf-8") as f: return json.load(f)
def save_json(p,d): 
    with open(p,"w",encoding="utf-8") as f: json.dump(d,f,indent=2)

def expand_genes(genes):
    out=set()
    for g in genes or []:
        out.add(g)
        if g in GENE_ALIAS: out.update(GENE_ALIAS[g])
    return sorted(out)

def normalize_patients(path):
    raw=load_json(path)  # expects list of dicts
    norm=[]
    for p in raw:
        q=dict(p)
        # unify 'mutations' -> 'genotype'
        muts=p.get("mutations",[])
        if "genotype" not in p: q["genotype"]=muts
        # expand aliases (HRD, MSI-H, etc.)
        q["genotype"]=expand_genes(q.get("genotype",[]))
        # normalize mood case to Title
        mood=p.get("mood","Neutral")
        q["mood"]=mood.title()
        norm.append(q)
    save_json(path,norm)
    return norm

def normalize_drugs_rich(path):
    # rich schema (performance, biomarkers, pharmacokinetics)
    raw=load_json(path)
    flat=[]
    for d in raw:
        perf=d.get("performance",{})
        eff=perf.get("efficacy_range",[0.65,0.75])
        base_eff=sum(eff)/2 if isinstance(eff,list) and len(eff)==2 else float(d.get("efficacy",0.7))
        tox=perf.get("toxicity_profile", d.get("toxicity_profile", {}))
        targets=d.get("targets")
        if not targets:
            rm=d.get("biomarkers",{}).get("required_mutations",[])
            targets=rm if isinstance(rm,list) else []
        flat.append({
            "drug_name": d.get("drug_name"),
            "efficacy": round(float(base_eff),3),
            "target_genes": targets,
            "toxicity_profile": tox,
            "repair_type": d.get("repair_type"),
            "approval": d.get("approval"),
            "mechanism": d.get("mechanism"),
            "route": d.get("route"),
            "match_score": perf.get("match_score"),
            "_rich": d
        })
    save_json(path,flat)
    return flat

def normalize_moods(path):
    # keep Title-case keys for consistency
    moods=load_json(path)
    out={}
    for k,v in moods.items():
        out[k.title()]=v
    save_json(path,out)
    return out

def normalize_organs(path):
    # ensure consistent letter case for organ names & toxicity tokens
    data=load_json(path)
    norm={}
    for organ,vals in data.items():
        o=organ.title()
        ds={}
        for tox,val in vals.get("drug_sensitivity",{}).items():
            ds[tox.strip().title()]=val
        norm[o]={
            "baseline_function": vals.get("baseline_function",0.9),
            "drug_sensitivity": ds
        }
    save_json(path,norm)
    return norm