FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive

# ── System base ───────────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget git build-essential ca-certificates gnupg \
    python3 python3-pip python3-dev python3-venv \
    libssl-dev libffi-dev libxml2-dev libxslt1-dev \
    libopenblas-dev liblapack-dev \
    r-base r-base-dev \
    openjdk-17-jre-headless \
    libhdf5-dev \
    unzip zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# ── Node.js (for Claude Code agent SDK) ──────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# ── Claude Code CLI ───────────────────────────────────────────────────────────
RUN npm install -g @anthropic-ai/claude-code

# ── Bioinformatics CLI tools ──────────────────────────────────────────────────
# BLAST+
RUN apt-get update && apt-get install -y --no-install-recommends ncbi-blast+ && rm -rf /var/lib/apt/lists/*

# SAMtools, BCFtools, BEDTools, BWA, minimap2, seqtk
RUN apt-get update && apt-get install -y --no-install-recommends \
    samtools bcftools bedtools bwa minimap2 seqtk \
    && rm -rf /var/lib/apt/lists/*

# FastQC
RUN apt-get update && apt-get install -y --no-install-recommends fastqc && rm -rf /var/lib/apt/lists/*

# GATK (Genome Analysis Toolkit)
RUN wget -q https://github.com/broadinstitute/gatk/releases/download/4.5.0.0/gatk-4.5.0.0.zip -O /tmp/gatk.zip \
    && unzip -q /tmp/gatk.zip -d /opt/ && rm /tmp/gatk.zip \
    && ln -s /opt/gatk-4.5.0.0/gatk /usr/local/bin/gatk

# Snakemake
RUN pip3 install --no-cache-dir snakemake

# Nextflow
RUN curl -s https://get.nextflow.io | bash && mv nextflow /usr/local/bin/

# AutoDock Vina (molecular docking)
RUN apt-get update && apt-get install -y --no-install-recommends autodock-vina && rm -rf /var/lib/apt/lists/* || true

# OpenBabel (chemical format conversion)
RUN apt-get update && apt-get install -y --no-install-recommends openbabel && rm -rf /var/lib/apt/lists/*

# PyMOL (protein structure rendering)
RUN apt-get update && apt-get install -y --no-install-recommends pymol && rm -rf /var/lib/apt/lists/* || true

# ── Python environment ────────────────────────────────────────────────────────
RUN python3 -m venv /opt/anuclaw-env
ENV PATH="/opt/anuclaw-env/bin:$PATH"

# Core scientific stack
RUN pip install --no-cache-dir \
    numpy scipy pandas matplotlib seaborn plotly \
    scikit-learn statsmodels lifelines pymc \
    ipython jupyter

# Bioinformatics / genomics
RUN pip install --no-cache-dir \
    biopython pysam pydeseq2 \
    scanpy anndata leidenalg \
    squidpy spatialdata \
    pyranges pybedtools \
    cyvcf2 hail \
    arboreto pyscenic \
    episcanpy muon

# Drug discovery / cheminformatics
RUN pip install --no-cache-dir \
    rdkit \
    deepchem \
    datamol molfeat \
    pytdc \
    py3Dmol

# Clinical / medical
RUN pip install --no-cache-dir \
    pyhealth \
    fhir.resources \
    medspacy \
    negspacy \
    scispacy

# Document processing (PDF / DOCX / CSV)
RUN pip install --no-cache-dir \
    pymupdf \
    pdfplumber \
    reportlab \
    python-docx

# Security (JWT / OIDC / encryption)
RUN pip install --no-cache-dir \
    pyjwt \
    cryptography \
    authlib

# Protein structure / design
RUN pip install --no-cache-dir \
    biotite \
    fair-esm || true

# Data management
RUN pip install --no-cache-dir \
    requests aiohttp \
    lxml beautifulsoup4 \
    openpyxl xlrd \
    pyarrow fastparquet \
    zarr h5py

# Utilities
RUN pip install --no-cache-dir \
    tqdm rich click \
    pydantic \
    python-dotenv \
    anthropic openai

# ── Workspace setup ───────────────────────────────────────────────────────────
RUN mkdir -p /workspace/group /workspace/output /workspace/skills

WORKDIR /workspace

# ── Entrypoint ────────────────────────────────────────────────────────────────
# Skills are mounted at /workspace/skills at runtime
# Group memory is mounted at /workspace/group
# Agent outputs go to /workspace/output

CMD ["claude", "--dangerously-skip-permissions"]
