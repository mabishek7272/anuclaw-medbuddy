# ANUClaw — Comprehensive Project Report

**Prepared by:** AMGI Research (Abi and Anu Research Initiative)  
**Version:** 1.0.0  
**Date:** June 2026  
**Classification:** Open Research

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Project Overview](#2-project-overview)
3. [Core Architecture](#3-core-architecture)
4. [Features & Capabilities](#4-features--capabilities)
5. [Domain Skills Library](#5-domain-skills-library)
6. [Messaging Channels](#6-messaging-channels)
7. [LLM Provider Support](#7-llm-provider-support)
8. [Security & Privacy](#8-security--privacy)
9. [Scope & Use Cases](#9-scope--use-cases)
10. [Advantages](#10-advantages)
11. [Limitations & Boundaries](#11-limitations--boundaries)
12. [Technical Specifications](#12-technical-specifications)
13. [Roadmap](#13-roadmap)

---

## 1. Executive Summary

**ANUClaw** is a unified, production-grade AI research and medical assistant platform designed and built entirely by **AMGI (Abi and Anu Research Initiative)**. It is a deployable runtime that puts the power of over **1,100 domain-specific AI skills** into any messaging platform — from WhatsApp to Slack to a local web browser — through a single, self-contained Node.js process.

ANUClaw was created to solve a fundamental problem in scientific and medical research: **fragmentation**. Researchers today switch between dozens of disconnected tools — command-line bioinformatics pipelines, chemistry databases, clinical literature engines, lab robots, and regulatory checklists — wasting time and losing context at every transition.

ANUClaw unifies all of these into one conversational AI platform. A researcher can run a BLAST sequence search, dock a drug candidate, search PubMed, generate a protein structure, simplify a patient report, and schedule a recurring analysis — all from a single chat message, on any device, in any messaging app.

### Key Numbers

| Metric | Value |
|---|---|
| Total domain skills | 1,100+ |
| Messaging channels supported | 14 |
| LLM providers supported | 5 |
| Hook pipeline events | 5 |
| Supported platforms | Windows, macOS, Linux |
| Core language | TypeScript / Node.js |
| Container environment | Ubuntu 24.04 + full scientific stack |
| License | MIT |

---

## 2. Project Overview

### 2.1 What ANUClaw Is

ANUClaw is an **agentic AI runtime** — not a chatbot wrapper, not a prompt library, not a single-purpose tool. It is a complete platform that:

- Connects to **14 messaging channels** simultaneously
- Routes incoming messages through a **5-event hook pipeline** for security and observability
- Dispatches conversations to **isolated Claude agent containers** pre-loaded with domain skills
- Returns results — text, images, plots, data files — directly back to the originating channel
- Maintains **per-group memory** (both file-based and structured SQLite) across sessions
- Runs **scheduled tasks** on cron schedules without human intervention

### 2.2 Who It Is For

| User Type | How They Use ANUClaw |
|---|---|
| **Genomics / bioinformatics researchers** | BLAST searches, variant calling, single-cell analysis, differential expression, pipeline execution |
| **Drug discovery scientists** | Molecular docking, ADMET screening, virtual screening, database queries (ChEMBL, DrugBank, PubChem) |
| **Clinical researchers** | PubMed literature search, ClinicalTrials.gov queries, study reporting, systematic reviews |
| **Medical professionals** | Patient document simplification, USMLE prep, clinical decision support reference, medical entity extraction |
| **Lab automation engineers** | Opentrons robot control, Benchling LIMS integration, self-driving lab optimisation, AR/XR lab guidance |
| **Regulatory affairs specialists** | 21 CFR Part 11 audit trails, HIPAA compliance, ISO 13485 templates, CE marking guidance |
| **Data scientists** | Statistical analysis, visualisation, survival analysis, ML pipelines |
| **Students & educators** | Literature review, concept explanation, study tools, research methodology guidance |

### 2.3 Design Philosophy

ANUClaw was built around five core principles:

1. **Unification over fragmentation** — one platform for every research need
2. **Security by default** — container isolation, path guards, credential protection, PHI redaction
3. **Channel agnosticism** — the same agent works equally well on WhatsApp, Telegram, Slack, or a browser
4. **Extensibility** — adding a new skill requires only dropping a `SKILL.md` file into a folder
5. **Privacy first** — no telemetry, no cloud storage, no third-party data sharing

---

## 3. Core Architecture

### 3.1 System Flow

```
User Message (any channel)
        │
        ▼
┌─────────────────────────┐
│   Channel Registry      │  ← 14 channels self-register at startup
│   (src/channels/)       │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│   Hook: BeforeMessage   │  ← Prompt injection guard, PHI check
│   (src/hooks.ts)        │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│   SQLite Persistence    │  ← Message stored, group registered
│   (src/db/)             │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│   Dual-Layer Memory     │  ← File memory (AGENTS.md) + SQLite facts
│   (src/memory.ts)       │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│   Context Compaction    │  ← Auto-summarise when session > threshold
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│   Hook: BeforeLLMCall   │  ← Inject context, modify prompt, audit
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────────────────────────┐
│   Agent Container (Docker / Apple Container) │
│                                             │
│   Claude Agent SDK                          │
│   + SOUL.md personality                    │
│   + 1100+ SKILL.md domain modules          │
│   + Full scientific Python/CLI stack        │
│   + Sub-agent spawning support              │
│   + /workspace/output/ for artifacts       │
└────────────┬────────────────────────────────┘
             │
             ▼
┌─────────────────────────┐
│   Hook: AfterToolCall   │  ← Audit results, PHI redaction
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│   Router                │  ← Per-channel length limits, media routing
│   (src/router.ts)       │
└────────────┬────────────┘
             │
             ▼
  Response + Artifacts → Channel
```

### 3.2 Key Architectural Components

#### Hook Engine (`src/hooks.ts`)

The hook engine is ANUClaw's most powerful infrastructure component. It intercepts every message, LLM call, and tool execution at five points:

| Hook Event | Triggered When | Default Behaviour |
|---|---|---|
| `BeforeMessage` | Any inbound message received | Prompt injection guard runs |
| `BeforeLLMCall` | Agent is about to call the LLM | LLM call logged for observability |
| `BeforeToolCall` | Agent is about to execute a tool | Tool call audited |
| `AfterToolCall` | Tool returns a result | Results inspected |
| `AfterMessage` | Response about to be sent | PHI redaction guard runs |

Each hook returns one of three outcomes: **allow**, **block**, or **modify**. This allows fine-grained control over the entire pipeline without touching agent code.

#### Dual-Layer Memory (`src/memory.ts`)

ANUClaw maintains two independent memory systems for every conversation group:

**File Memory** — an append-only `AGENTS.md` file per group. The agent writes observations, user preferences, and research context directly to this file. It persists indefinitely and is injected into every new session.

**Structured SQLite Memory** — a relational fact store with confidence scores and supersession tracking. Facts can be queried, updated, and expired. This enables the agent to maintain evolving understanding (e.g., updating a user's research focus as it changes over time).

Both layers are combined into a single memory context block injected into the system prompt at the start of every agent run.

#### Context Compaction

When a conversation session exceeds the configured message threshold (default: 80 messages), ANUClaw automatically compacts the older portion of the conversation into a summary, preserving the most recent exchanges verbatim. This allows indefinitely long research conversations without hitting LLM context limits.

#### Container Isolation

Every conversation group runs its agent in a completely isolated Linux container:
- Separate filesystem per group
- No cross-group data access
- Container destroyed after each response (stateless execution)
- Volume mounts provide controlled access to group workspace and output directory
- Credentials injected via stdin — never written to disk inside the container

#### Path Guard (`src/path-guard.ts`)

A security layer that runs before any file operation. It blocks access to:
- `.ssh/` directories and private keys
- `.aws/` credential files
- `.env` files
- Any file matching patterns for `credentials`, `secrets`, `private_key`, `passwd`, `shadow`

This prevents agents from accidentally (or maliciously) accessing system credentials even when given file system tools.

---

## 4. Features & Capabilities

### 4.1 Runtime Features

| Feature | Description |
|---|---|
| **14-channel support** | WhatsApp, Telegram, Discord, Slack, Feishu, DingTalk, Email, Signal, Matrix, iMessage, IRC, Nostr, QQ, Local Web |
| **Self-registering channels** | Channels activate automatically if their credentials are present in `.env` — no code changes needed |
| **Per-group job queue** | Messages for each group are serialised in a queue — no race conditions between concurrent messages |
| **SOUL.md personality** | A Markdown personality file injected into every agent system prompt. Supports global and per-group overrides |
| **Sub-agent spawning** | The main agent can spawn scoped child agents for parallel subtasks with restricted tool sets |
| **Scheduled tasks** | Cron-based recurring tasks stored in SQLite, persisted across restarts, scoped to conversation groups |
| **Voice transcription** | WhatsApp and Telegram voice notes transcribed via OpenAI Whisper API or local whisper.cpp |
| **Wet-lab image analysis** | Gel images, Western blots, colony plates analysed by Claude vision model directly in chat |
| **SSH from chat** | Type `ssh <alias>` in the chat box to run commands on configured remote hosts |
| **Multi-thread web UI** | Local browser interface with separate conversation threads, each with independent memory |
| **Artifact delivery** | Plots, CSV files, PDFs, and images produced by the agent are sent back to the user automatically |

### 4.2 Memory & Context Features

| Feature | Description |
|---|---|
| **File memory** | Per-group `AGENTS.md` append-only log — persists user preferences, research context, notes |
| **Structured memory** | SQLite fact store with confidence scores, supersession, and source tracking |
| **Context compaction** | Automatic summarisation of old messages when session exceeds configurable threshold |
| **Session resume** | Full conversation history (including tool calls and results) persisted in SQLite and resumed on next message |
| **Per-group isolation** | Each group's memory is completely isolated — no cross-contamination between research teams or patients |

### 4.3 Security Features

| Feature | Description |
|---|---|
| **Container isolation** | True OS-level isolation — each agent run is a separate Linux container |
| **Path guard** | Blocks file tool access to `.ssh`, `.aws`, `.env`, credentials, and private keys |
| **Credential proxy** | API keys injected into containers via stdin — never written to any file |
| **Prompt injection guard** | Built-in hook detects and blocks common prompt injection patterns |
| **PHI redaction** | Built-in hook detects and redacts SSNs, MRNs, DOBs, phone numbers, emails in outbound messages |
| **No telemetry** | Zero data sent to external services — all processing is local |
| **Audit logging** | Full event log for regulated environments (supports 21 CFR Part 11 compliance) |

### 4.4 Developer / Operator Features

| Feature | Description |
|---|---|
| **5-event hook engine** | Intercept and modify any point in the pipeline with custom logic |
| **Skill-based extensibility** | Add a new capability by dropping a `SKILL.md` file — no code changes needed |
| **Multi-provider LLM** | Switch between Anthropic, OpenRouter, OpenAI, Ollama with one env variable |
| **TypeScript throughout** | Fully typed codebase with strict mode — safe refactoring, IDE support |
| **SQLite persistence** | Embedded database — no external database service required |
| **Structured logging** | Timestamped logs with configurable level (debug/info/warn/error) written to file and console |
| **One-command setup** | `bash setup.sh` (Linux/Mac) or `setup.ps1` (Windows) handles everything |
| **Docker + Apple Container** | Container build script auto-detects runtime |

---

## 5. Domain Skills Library

ANUClaw ships with **1,100+ SKILL.md domain skill modules** organised across 9 domains. Each skill is a self-contained Markdown file that teaches the agent when and how to use a specific tool, database, or workflow.

### 5.1 Biology & Genomics (350+ skills)

**Sequence Analysis**
- BLAST+ (blastn, blastp, blastx, tblastn) for sequence similarity search
- BWA and minimap2 for short-read and long-read alignment
- SAMtools, BEDTools, bcftools for BAM/VCF manipulation
- FastQC and MultiQC for sequencing quality control
- seqtk for FASTA/FASTQ manipulation

**Variant Analysis**
- GATK HaplotypeCaller and DeepVariant for variant calling
- VCF annotation, filtering, normalisation
- ClinVar, dbSNP, gnomAD database queries
- Polygenic risk score calculation
- Somatic variant calling and tumour mutational burden

**RNA Sequencing**
- DESeq2 and edgeR for differential expression
- STAR, HISAT2, salmon for alignment and quantification
- Pathway enrichment (GSEA, GO, KEGG, Reactome)
- Splicing analysis, isoform switching
- WGCNA network analysis

**Single-Cell & Spatial Omics**
- scanpy full pipeline (QC, normalisation, clustering, UMAP)
- AnnData and Seurat-compatible workflows
- Trajectory inference (scVelo, Palantir)
- Cell-cell communication analysis
- Spatial transcriptomics (Visium, Slide-seq, MERFISH)
- Multi-modal integration (CITE-seq, ATAC+RNA)

**Epigenomics**
- ATAC-seq peak calling and differential accessibility
- ChIP-seq peak annotation and motif analysis
- Hi-C contact matrix analysis and TAD detection
- DNA methylation (bismark, methylKit, DMR detection)

**Metagenomics**
- Kraken2, MetaPhlAn for taxonomic classification
- Functional profiling (HUMAnN)
- AMR gene detection
- Microbiome diversity analysis (QIIME2)

**Other**
- CRISPR screen analysis (MAGeCK, JACKS)
- Phylogenetics (tree inference, visualisation)
- Population genetics (GWAS, PLINK, structure)
- Multi-omics integration (MOFA, DIABLO)
- Proteomics (MaxQuant, Perseus, DIA-NN)
- Metabolomics (XCMS, MetaboAnalyst)

### 5.2 Drug Discovery & Chemistry (120+ skills)

**Cheminformatics**
- RDKit for molecular manipulation, descriptors, fingerprints
- datamol and molfeat for ML-ready molecular representations
- SMILES/InChI parsing, validation, standardisation
- Substructure search and scaffold analysis
- Lipinski Rule of Five and drug-likeness assessment

**Molecular Docking**
- AutoDock Vina docking with pose analysis
- DiffDock ML-based docking
- Hydrogen bond and interaction visualisation (PyMOL)
- Binding site identification
- Ensemble docking workflows

**ADMET & Pharmacology**
- Absorption, distribution, metabolism, excretion, toxicity prediction
- BBB penetration, hERG liability, CYP inhibition
- PyTDC ADMET benchmark datasets
- Solubility, permeability, bioavailability estimation

**QSAR & ML**
- QSAR model building (scikit-learn, DeepChem)
- Activity cliff analysis
- Virtual screening pipelines
- Bayesian optimisation for lead optimisation

**Databases**
- PubChem compound and bioassay search
- ChEMBL activity data retrieval
- BindingDB affinity data queries
- DrugBank drug information and interactions
- ZINC purchasable compound screening
- OpenFDA drug labels and adverse events

**Advanced**
- PROTAC design workflows
- Molecular glue discovery
- Drug repurposing (OpenTargets, DGIdb)
- Pharmacovigilance (FAERS data analysis)
- Drug-drug interaction prediction

### 5.3 Medical & Clinical (200+ skills)

**Literature & Evidence**
- PubMed search with structured abstract extraction
- bioRxiv and medRxiv preprint search
- Systematic review and meta-analysis support
- PRISMA and CONSORT reporting checklists
- Citation management and evidence synthesis

**Clinical Trials**
- ClinicalTrials.gov query (condition, intervention, status, phase)
- Trial eligibility assessment
- Protocol design guidance (SPIRIT checklist)
- Phase I/II/III/IV workflow support

**Patient-Facing Tools**
- Medical document simplification (discharge summaries, prescriptions, lab reports)
- Medical entity extraction (symptoms, medications, lab values, diagnoses)
- Health trend analysis from wearable data
- Multilingual medical communication support

**Clinical Decision Support**
- Diagnostic reasoning assistance
- Treatment guideline queries
- Drug dosing references
- Differential diagnosis generation

**Medical Education**
- USMLE Step 1, 2 CK, Step 3 preparation
- Progress tracking and weak area identification
- Residency match planning support
- Medical concept explanation at multiple levels

**Specialty Research**
- Oncology and precision medicine
- Hematology (clonal hematopoiesis, MRD)
- Immunology and cell therapy
- Infectious disease and AMR surveillance
- Neurology and neuroimaging
- Cardiology biomarker analysis

**Mental Health**
- Mental health screening support
- Crisis detection and response protocols
- Psychologist consultation preparation
- Grief and support companionship tools

### 5.4 Protein Structure & Design (40+ skills)

- AlphaFold structure retrieval from EBI database (200M+ structures)
- ESMFold and ESM-2 language model embeddings
- RFDiffusion de novo protein backbone design
- ProteinMPNN sequence design for given backbones
- FoldSeek structural similarity search
- Antibody design and humanisation scoring
- BindCraft binder design
- PyMOL structure rendering (rainbow, cartoon, surface, stick)
- Hydrogen bond and contact analysis
- Protein-ligand interaction visualisation
- PDB structure retrieval and manipulation

### 5.5 Lab Automation & XR (30+ skills)

- Opentrons OT-2 and OT-3 liquid handling robot protocol generation
- Benchling LIMS: entity registration, notebook entries, inventory
- LabArchives electronic lab notebook integration
- AR/XR step-by-step protocol overlays for LabOS headsets
- Hand tracking and gesture recognition for lab guidance
- Self-driving lab via Bayesian optimisation (suggest next experiment)
- Colony plate counting and morphology analysis from images
- Gel and blot image quality assessment
- Digital twin and simulation setup
- Ginkgo Bioworks Cloud Lab integration

### 5.6 Regulatory & Compliance (50+ skills)

- **FDA 21 CFR Part 11**: electronic records, audit trail generation, signature management
- **HIPAA**: PHI detection, redaction, risk assessment checklists, BAA guidance
- **ISO 13485**: quality management system templates for medical devices
- **IEC 62304**: software safety classification, risk assessment templates
- **ISO 14971**: risk management for medical devices
- **EU MDR 2017/745**: CE marking pathway guidance
- **ICH E6(R2)**: GCP guidelines for clinical trials
- **CONSORT / PRISMA / SPIRIT**: reporting standard checklists
- UDI label generation (HIBC / GS1)
- Regulatory strategy planning

### 5.7 Data Science & Statistics (100+ skills)

- Hypothesis testing (t-test, ANOVA, chi-square, Mann-Whitney)
- Regression (linear, logistic, Poisson, mixed effects)
- Survival analysis (Kaplan-Meier, Cox regression)
- Bayesian modelling (PyMC)
- Power analysis and sample size calculation
- Multiple testing correction (Bonferroni, FDR)
- Dimensionality reduction (PCA, UMAP, t-SNE)
- Clustering (k-means, hierarchical, DBSCAN)
- Feature importance (SHAP, permutation)
- Time series forecasting

### 5.8 Literature & Database Search (60+ skills)

- PubMed / NCBI Entrez full-text and abstract search
- arXiv and bioRxiv preprint search
- Patent search (USPTO, Google Patents)
- Grant database search (NIH Reporter, Wellcome)
- OpenAlex scholarly graph queries
- Wikipedia multi-language encyclopedic search
- 17-engine multi-search (Google, DuckDuckGo, Baidu, WolframAlpha, and more)
- Scientific writing and manuscript structuring
- Citation formatting (APA, Vancouver, BibTeX)

### 5.9 General & Utilities (80+ skills)

- Document processing (PDF, DOCX, XLSX, PPTX)
- Browser automation and web scraping
- GitHub integration (issues, PRs, code search)
- Weather data retrieval
- Structured data transformation (CSV, JSON, Parquet)
- LaTeX poster and figure generation
- Infographic creation guidance
- Code review and debugging
- Workflow orchestration (Nextflow, Snakemake, WDL, CWL)

---

## 6. Messaging Channels

ANUClaw supports **14 messaging channels** out of the box. All channels self-register at startup when their credentials are present in `.env`.

| Channel | Protocol | Auth Method | Group Support | File Sharing |
|---|---|---|---|---|
| WhatsApp | Baileys (unofficial WA API) | QR / pairing code | ✅ | ✅ |
| Telegram | Bot API | Bot token | ✅ | ✅ |
| Discord | Gateway API | Bot application | ✅ | ✅ |
| Slack | Socket Mode | Bot + App token | ✅ | ✅ |
| Feishu / Lark | WebSocket long connection | App ID + Secret | ✅ | ✅ |
| DingTalk | Stream mode | Client ID + Secret | ✅ | ✅ |
| Email (Gmail) | IMAP/SMTP | OAuth2 | ❌ (1:1) | ✅ |
| Signal | signal-cli | Phone registration | ✅ | ✅ |
| Matrix | Matrix SDK | Access token | ✅ | ✅ |
| iMessage | AppleScript | macOS system | ✅ | ✅ |
| IRC | IRC framework | Nick registration | ✅ | ❌ |
| Nostr | WebSocket relay | Private key | ✅ | ❌ |
| QQ | OpenShamrock | WebSocket | ✅ | ✅ |
| Local Web UI | Express + SSE | Optional password | ✅ | ✅ |

**Each channel produces the same agent experience** — the same skills, memory, and hooks run regardless of which channel the message came from.

---

## 7. LLM Provider Support

ANUClaw supports **5 LLM provider modes**, switchable via a single environment variable.

| Provider | `MODEL_PROVIDER` value | Models | API Key Required |
|---|---|---|---|
| **Anthropic (Claude)** | `anthropic` | claude-opus-4, claude-sonnet-4-6, claude-haiku-4-5 | ✅ |
| **OpenRouter** | `openrouter` | 200+ models (DeepSeek, Gemini, GPT, Claude, Llama, Mistral) | ✅ |
| **OpenAI-compatible** | `openai-compatible` | Any model at a `/chat/completions` endpoint | ✅ |
| **OpenAI / Codex** | `openai-codex` | gpt-4o, o3, reuse local Codex CLI login | Optional |
| **Ollama (local)** | `ollama` | llama3, mistral, phi-4, deepseek-r2, any local model | ❌ |

The Ollama provider is particularly powerful for regulated or air-gapped environments — ANUClaw can run entirely offline with a local model and local container.

---

## 8. Security & Privacy

### 8.1 Security Architecture

ANUClaw was designed with a **defence-in-depth** approach. Multiple independent security layers protect data and system integrity.

```
Layer 1: Hook engine          — prompt injection detection, PHI redaction
Layer 2: Path guard           — blocks access to credential files
Layer 3: Container isolation  — OS-level separation per group
Layer 4: Credential proxy     — secrets never written to disk
Layer 5: SQLite WAL mode      — safe concurrent database access
Layer 6: Audit logging        — full event trail for compliance
```

### 8.2 Data Privacy Commitments

- **No telemetry** — ANUClaw never sends usage data, conversation content, or metadata to any external service
- **No cloud storage** — all data (messages, memory, sessions, artifacts) is stored locally in SQLite and the filesystem
- **No third-party data sharing** — the only outbound network calls are to the configured LLM API and the databases the agent explicitly queries during a research task
- **Local model support** — with Ollama, ANUClaw can operate in a fully air-gapped environment with zero external network calls

### 8.3 HIPAA Awareness

ANUClaw includes built-in HIPAA-awareness capabilities:
- PHI detection patterns (SSN, MRN, DOB, phone, email, IP addresses)
- Automatic redaction hook on outbound messages
- HIPAA risk assessment skill
- Audit trail generation compatible with 21 CFR Part 11
- Guidance on BAA requirements

> **Note:** ANUClaw is a research tool. For clinical deployments handling real patient data, a full HIPAA compliance review by qualified professionals is required.

---

## 9. Scope & Use Cases

### 9.1 What ANUClaw Is Designed For

#### Research Acceleration
- Running bioinformatics pipelines from a WhatsApp message
- Searching 40+ scientific databases from a single prompt
- Generating publication-quality figures and sending them back to chat
- Scheduling nightly literature digests on a topic
- Running differential expression analysis on uploaded count matrices

#### Drug Discovery Support
- Triaging compound libraries by ADMET properties
- Docking candidate ligands against a target structure
- Pulling bioactivity data from ChEMBL and BindingDB
- Building target intelligence dossiers from UniProt, OpenTargets, STRING
- Designing QSAR models from activity data

#### Clinical Research
- Systematic literature reviews with PRISMA compliance
- ClinicalTrials.gov feasibility searches
- Study design and statistical power calculations
- Patient-facing document simplification
- USMLE examination preparation

#### Lab Operations
- Generating Opentrons protocols from natural language descriptions
- Creating Benchling notebook entries from experimental results
- Guiding through protocols via AR overlay in the lab
- Optimising experimental parameters with self-driving lab algorithms
- Analysing gel and blot images directly from a phone photo

#### Regulatory & Compliance
- Generating 21 CFR Part 11 compliant audit trails
- HIPAA PHI scanning and redaction
- Creating ISO 13485 documentation templates
- Drafting regulatory strategy summaries

### 9.2 Concrete Example Workflows

**Workflow 1: Variant Analysis**
> User sends: "Run variant calling on the BAM file I uploaded and tell me which variants are clinically significant"
> 
> ANUClaw: runs GATK HaplotypeCaller → filters variants → queries ClinVar for clinical significance → returns annotated VCF and summary table

**Workflow 2: Drug Candidate Triage**
> User sends: "Screen this list of 50 SMILES for Lipinski compliance and predict their ADMET profiles"
>
> ANUClaw: parses SMILES → runs RDKit descriptors → calculates drug-likeness → runs ADMET predictions → returns ranked table with traffic-light scoring as a CSV

**Workflow 3: Literature Digest (Scheduled)**
> Admin sets up: "Every Monday at 8am, search PubMed for the last 7 days of CRISPR papers and post a summary to the #research Slack channel"
>
> ANUClaw: runs automatically on schedule → searches PubMed → extracts key findings → posts formatted digest to Slack

**Workflow 4: Lab Protocol Execution**
> User sends a photo of a gel: "Is this SDS-PAGE gel OK to proceed with?"
>
> ANUClaw: analyses the image → identifies lane quality, band sharpness, ladder alignment → returns a go/no-go recommendation with lane-by-lane notes

**Workflow 5: Patient Document**
> Clinician sends: "Simplify this discharge summary for my patient who has a 6th grade reading level"
>
> ANUClaw: rewrites the discharge summary in plain language, explains all medical terms, adds a clear list of next steps → returns simplified document

---

## 10. Advantages

### 10.1 Versus Single-Purpose Research Tools

| Advantage | Details |
|---|---|
| **Unified interface** | One platform replaces dozens of disconnected tools |
| **Context persistence** | Memory carries across sessions — the agent remembers your project |
| **Natural language** | No CLI syntax to memorise — describe what you want in plain language |
| **Result delivery** | Outputs come directly to your messaging app — no log in to check |
| **Scheduling** | Set recurring analyses and receive digests automatically |

### 10.2 Versus Generic Chatbots (ChatGPT, Claude.ai, etc.)

| Advantage | Details |
|---|---|
| **Real tool execution** | Actually runs BLAST, docks molecules, calls APIs — doesn't just describe how to |
| **Domain skills** | 1,100+ specialised skill modules for scientific precision |
| **File I/O** | Accepts uploaded data files, produces downloadable results |
| **Your data stays local** | No conversation data sent to third-party services beyond the LLM API call |
| **Messaging integration** | Works in WhatsApp, Slack, Telegram — where your team already communicates |
| **Scheduling** | Runs tasks on cron schedules without human presence |

### 10.3 Versus Cloud-Based Research Platforms

| Advantage | Details |
|---|---|
| **No subscription fees** | Self-hosted — pay only for LLM API calls (or use Ollama for free) |
| **Full data control** | All data remains on your own infrastructure |
| **Customisable** | Every aspect — skills, personality, hooks, channels — is configurable |
| **No vendor lock-in** | Switch LLM providers with one environment variable change |
| **Air-gap capable** | Can operate fully offline with Ollama + local container |
| **Extensible** | Add domain skills without writing any code |

### 10.4 Unique Technical Advantages

| Feature | Why It Matters |
|---|---|
| **Hook engine** | Unique capability — intercept and control any point in the pipeline. Enables compliance logging, security policies, and custom business logic without touching agent code |
| **Dual-layer memory** | Combines the natural language richness of file memory with the queryability of structured facts — more powerful than either alone |
| **Container isolation per group** | Research teams, patient groups, and project workspaces are truly isolated at the OS level — not just application-level permission checks |
| **Self-registering channels** | Add a new channel by adding credentials — no code changes, no restart required |
| **SOUL.md personality** | Per-group agent personalities enable specialised assistants (a clinical assistant, a bioinformatics assistant, a lab assistant) all running from one deployment |
| **Path guard** | Prevents credential theft even if an adversarial prompt attempts to read sensitive files |

---

## 11. Limitations & Boundaries

### 11.1 What ANUClaw Is NOT

| Misconception | Reality |
|---|---|
| A clinical decision-making system | ANUClaw supports research and education — it does not replace clinical judgment or medical diagnosis |
| A wet-lab automation system | ANUClaw generates protocols and commands — physical execution requires human oversight and certified safety procedures |
| A validated ADMET or affinity oracle | Docking scores and ADMET predictions are prioritisation signals — not experimental proof |
| A regulatory submission tool | Templates and guidance are for research reference — actual regulatory submissions require qualified regulatory affairs professionals |
| A substitute for expert review | ANUClaw augments expertise — it does not replace peer review, clinical expertise, or scientific judgment |

### 11.2 Technical Limitations

- Container startup adds ~2–5 seconds latency per response compared to direct API calls
- Voice transcription quality depends on audio quality and chosen Whisper model
- Some channels (iMessage, QQ) have platform-specific requirements and limited file sharing
- Ollama local models produce lower quality outputs than frontier models for complex scientific reasoning
- The WhatsApp channel uses an unofficial API and may be affected by WhatsApp policy changes

### 11.3 Compute Requirements

| Environment | Minimum | Recommended |
|---|---|---|
| RAM | 4 GB | 16 GB |
| Storage | 20 GB | 100 GB (for large genomics datasets) |
| CPU | 2 cores | 8 cores |
| GPU | Not required | Optional (for local ML models) |
| OS | Ubuntu 20.04 / macOS 12 / Windows 10 | Ubuntu 24.04 / macOS 14 / Windows 11 |

---

## 12. Technical Specifications

### 12.1 Runtime Stack

| Component | Technology |
|---|---|
| Core language | TypeScript 5.x (strict mode) |
| Runtime | Node.js 20+ |
| Agent SDK | Anthropic Claude Agent SDK |
| Database | SQLite (better-sqlite3, WAL mode) |
| Container | Docker or Apple Container |
| Container base | Ubuntu 24.04 LTS |
| Task scheduling | cron (node-cron) |
| Web server | Express 4 + SSE |
| Build | tsc (TypeScript compiler) |
| Test framework | Vitest |
| Code style | Prettier + ESLint |

### 12.2 Container Scientific Stack

**CLI Tools**
`BLAST+` · `SAMtools` · `BCFtools` · `BEDTools` · `BWA` · `minimap2` · `FastQC` · `seqtk` · `GATK 4.5` · `AutoDock Vina` · `OpenBabel` · `PyMOL` · `Snakemake` · `Nextflow`

**Python Libraries (selection)**
`BioPython` · `scanpy` · `AnnData` · `PyDESeq2` · `pysam` · `RDKit` · `DeepChem` · `datamol` · `molfeat` · `PyTDC` · `pyhealth` · `fhir.resources` · `pandas` · `numpy` · `scipy` · `matplotlib` · `seaborn` · `plotly` · `scikit-learn` · `statsmodels` · `lifelines` · `PyMC` · `squidpy` · `arboreto`

### 12.3 Database Integrations (40+)

`PubMed/NCBI` · `UniProt` · `PDB` · `AlphaFold DB` · `ChEMBL` · `DrugBank` · `PubChem` · `BindingDB` · `OpenTargets` · `KEGG` · `Reactome` · `STRING` · `ClinVar` · `dbSNP` · `gnomAD` · `Ensembl` · `GEO` · `OMIM` · `OpenFDA` · `ClinicalTrials.gov` · `JASPAR` · `InterPro` · `cBioPortal` · `TCGA` · `HMDB` · `ZINC` · `OpenAlex` · `bioRxiv` · `medRxiv` · `USPTO` · `Brenda` · `COSMIC` · `DepMap` · `ExAC` · `GTEx` · `UK Biobank (navigator)` · `Monarch Disease` · `GWAS Catalog`

---

## 13. Roadmap

### v1.1 — Dashboard & Observability
- Full web dashboard with real-time conversation monitoring
- Skill usage analytics and agent trace viewer
- Group management panel
- Hook configuration UI
- Scheduled task manager

### v1.2 — Enhanced Collaboration
- Multi-user workspace support
- Role-based access control per channel/group
- Shared skill libraries across groups
- Team annotation and flagging on agent outputs

### v1.3 — Extended Modalities
- PDF and document upload processing (OCR + analysis)
- Microscopy image analysis (cell counting, morphology)
- Mass spectrometry data processing
- Flow cytometry data analysis from uploaded FCS files

### v2.0 — Enterprise Features
- LDAP/SSO authentication
- Deployment via Docker Compose / Kubernetes
- Multi-node horizontal scaling
- Encrypted at-rest SQLite
- Full HIPAA BAA support package

---

## Appendix A — Skill Module Format

Every skill in ANUClaw is a `SKILL.md` file with the following structure:

```markdown
# Skill Name

Brief description of what this skill does.

## When to Use
- Trigger conditions that tell the agent to activate this skill

## Capabilities
- Code examples
- API call patterns
- Database query templates
- CLI command examples

## Output
- Where to save results (/workspace/output/)
- Expected output formats
```

New skills can be contributed by dropping a folder containing `SKILL.md` into `container/skills/` and rebuilding the container. No TypeScript changes required.

---

## Appendix B — Environment Variables Reference

| Variable | Default | Description |
|---|---|---|
| `MODEL_PROVIDER` | `anthropic` | LLM provider |
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `TRIGGER_PATTERN` | `@ANUClaw` | What triggers the bot in groups |
| `MAX_SESSION_MESSAGES` | `80` | Context compaction threshold |
| `CONTAINER_TIMEOUT_MS` | `300000` | Max agent run time (5 min) |
| `HOOKS_ENABLED` | `true` | Enable/disable hook pipeline |
| `MEMORY_MODE` | `dual` | `dual` / `file-only` / `sqlite-only` |
| `WHISPER_ENABLED` | `false` | Enable voice transcription |
| `WEB_PORT` | `3721` | Local web UI port |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |

Full reference: see `.env.example`

---

*© 2026 AMGI Research — Abi and Anu Research Initiative. All rights reserved.*  
*ANUClaw is released under the MIT License.*
