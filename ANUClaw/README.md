<div align="center">

<img src="docs/assets/anuclaw_logo.png" width="180" alt="ANUClaw Logo" />

# ANUClaw

### The Ultimate AI Research & Medical Assistant Platform

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)]()
[![License](https://img.shields.io/badge/license-MIT-green.svg)]()
[![Channels](https://img.shields.io/badge/channels-14-purple.svg)]()
[![Skills](https://img.shields.io/badge/skills-1100%2B-brightgreen.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)]()
[![Platform](https://img.shields.io/badge/platform-Win%20%7C%20Mac%20%7C%20Linux-lightgrey.svg)]()
[![Built by](https://img.shields.io/badge/Built%20by-AMGI%20Research-orange.svg)]()

**Designed & Built by AMGI — Abi & Anu Research Initiative**

</div>

---

## What is ANUClaw?

**ANUClaw** is a production-grade AI research and medical assistant platform built from the ground up by **AMGI (Abi and Anu)**. It delivers a complete, unified runtime covering genomics, drug discovery, clinical medicine, lab automation, XR integration, and regulatory compliance — all accessible through 14 messaging channels from a single deployment.

### Why ANUClaw?

Most AI research tools are fragmented — one tool for sequencing, another for drug discovery, another for clinical literature. ANUClaw was designed to eliminate that fragmentation. One platform. One deployment. Every capability your research needs.

| Capability | ANUClaw |
|---|:---:|
| Deployable runtime (single process) | ✅ |
| Messaging channels supported | **14** |
| Domain skills | **1100+** |
| Hook engine (gate / modify / audit all calls) | ✅ |
| Sub-agent spawning | ✅ |
| XR / AR lab hardware integration | ✅ |
| FHIR / EHR integration | ✅ |
| Regulatory compliance (FDA / ISO / HIPAA) | ✅ |
| Multi-provider LLM (5 providers) | ✅ |
| Voice transcription | ✅ |
| Dual-layer memory (file + SQLite) | ✅ |
| Context compaction | ✅ |
| Path guard security | ✅ |
| SOUL.md personality customisation | ✅ |
| Wet-lab image analysis | ✅ |
| Per-group container isolation | ✅ |

---

## Quick Start

### macOS / Linux

```bash
git clone https://github.com/amgi-research/ANUClaw.git
cd ANUClaw
bash setup.sh
```

### Windows (PowerShell)

```powershell
git clone https://github.com/amgi-research/ANUClaw.git
cd ANUClaw
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

### Manual

```bash
npm install
cp .env.example .env        # fill in your API keys
docker build -t anuclaw-agent:latest container/
npm start
```

Then open **http://localhost:3721** for the local web UI, or message your bot on any connected channel.

---

## Channels (14 Supported)

| Channel | Status | Notes |
|---|---|---|
| WhatsApp | ✅ Built-in | QR / pairing code auth |
| Telegram | ✅ Built-in | Bot token |
| Discord | ✅ Built-in | Bot application |
| Slack | ✅ Built-in | Socket mode |
| Feishu / Lark | ✅ Built-in | WebSocket long connection |
| DingTalk | ✅ Built-in | Stream mode |
| Email (Gmail) | ✅ Built-in | OAuth2 |
| Signal | ✅ Built-in | signal-cli bridge |
| Matrix | ✅ Built-in | Matrix SDK |
| iMessage | ✅ Built-in | AppleScript bridge (macOS) |
| IRC | ✅ Built-in | irc-framework |
| Nostr | ✅ Built-in | nostr-tools |
| QQ | ✅ Built-in | OpenShamrock |
| Local Web UI | ✅ Built-in | http://localhost:3721 |

All channels self-register at startup — configure only the ones you need in `.env`.

---

## LLM Provider Support

| Provider | Model examples |
|---|---|
| **Anthropic** | claude-opus-4, claude-sonnet-4-6, claude-haiku-4-5 |
| **OpenRouter** | deepseek/deepseek-chat-v3, google/gemini-2.5-flash, any model |
| **OpenAI-compatible** | Any `/chat/completions` endpoint |
| **OpenAI / Codex** | gpt-4o, o3, Codex CLI login |
| **Ollama (local)** | llama3, mistral, phi-4, any local model |

Switch providers by changing a single `MODEL_PROVIDER` variable in `.env`.

---

## Skills (1100+)

### By Domain

| Domain | Skills |
|---|---|
| 🧬 Biology & Genomics | 350+ |
| 💊 Drug Discovery & Chemistry | 120+ |
| 🏥 Medical & Clinical | 200+ |
| 🔬 Lab Automation & XR | 30+ |
| 🧪 Protein Structure & Design | 40+ |
| 📊 Data Science & Statistics | 100+ |
| 📚 Literature & Database Search | 60+ |
| 🔒 Regulatory & Compliance | 50+ |
| ⚙️ General & Utilities | 80+ |

### Highlights by Category

**Genomics & Bioinformatics**
BLAST, BWA, GATK, DeepVariant, DESeq2, scanpy, single-cell RNA-seq, spatial transcriptomics, ATAC-seq, ChIP-seq, Hi-C, metagenomics, long-read nanopore, CRISPR screen analysis, phylogenetics, multi-omics integration

**Drug Discovery**
RDKit, DiffDock, AutoDock Vina, ADMET prediction, QSAR modelling, virtual screening, PROTAC design, drug repurposing, pharmacovigilance, molecular docking pipelines

**Protein Structure & Design**
AlphaFold structure retrieval, RFDiffusion de novo design, ProteinMPNN sequence design, ESM language model embeddings, FoldSeek structural search, antibody design, binder design (BindCraft)

**Clinical & Medical**
PubMed literature search, ClinicalTrials.gov queries, USMLE Step 1/2/3 prep, patient document simplification, clinical decision support, medical entity extraction, medical imaging review, FHIR/EHR parsing, mental health tools

**Lab Automation & XR**
Opentrons liquid handling robot, Benchling LIMS/ELN integration, AR/XR step-by-step lab guidance, hand tracking overlays, self-driving lab via Bayesian optimisation, digital twin simulation

**Regulatory & Compliance**
21 CFR Part 11 audit trails, HIPAA PHI detection/redaction, ISO 13485 templates, IEC 62304 software risk assessment, CE marking guidance, CONSORT/PRISMA reporting checklists

**Databases (40+)**
UniProt, PDB, OMIM, TCGA, cBioPortal, HMDB, ZINC, GEO, gnomAD, ClinVar, OpenTargets, KEGG, Reactome, STRING, JASPAR, ChEMBL, DrugBank, BindingDB, PubChem, OpenFDA, and more

---

## Architecture

```
Channels (WhatsApp / Telegram / Discord / Slack / Feishu / ...)
    ↓
Hook: BeforeMessage  ──── filter / modify / block inbound
    ↓
SQLite message store + Dual-layer memory (file + structured facts)
    ↓
Context compaction  ──── auto-summarise when session > threshold
    ↓
Hook: BeforeLLMCall  ──── inject context / modify prompt / block
    ↓
Container  ──── Claude Agent SDK + 1100+ domain skills
    ↓           (sub-agent spawning supported)
Hook: AfterToolCall  ──── audit results / gate / transform
    ↓
Hook: AfterMessage  ──── PHI redaction / logging
    ↓
Response routed back to originating channel(s)
```

### Design Principles

- **Single process** — one Node.js process handles all 14 channels simultaneously
- **Container isolation** — each group runs agents in its own Linux container (true OS-level isolation)
- **Per-group memory** — every group has its own isolated filesystem, AGENTS.md, and SQLite facts
- **Dual-layer memory** — combines append-only file memory with structured, queryable SQLite facts
- **Hook engine** — 5 events × 3 outcomes (allow / block / modify) for full pipeline control
- **Credential security** — API keys injected via stdin, never written to disk or container filesystem
- **Path guard** — file tools cannot access `.ssh`, `.aws`, `.env`, or credential files
- **SOUL.md** — agent personality file injected into every system prompt (per-group overrides supported)

---

## Agent Features

| Feature | Details |
|---|---|
| **Hook engine** | 5 events: BeforeMessage · BeforeLLMCall · BeforeToolCall · AfterToolCall · AfterMessage |
| **Sub-agents** | Spawn scoped child agents with a restricted, sandboxed tool set |
| **Context compaction** | Auto-summarise old messages when session exceeds configurable threshold |
| **SOUL.md personality** | Per-group or global personality injected into every system prompt |
| **Dual-layer memory** | File memory (AGENTS.md) + structured SQLite facts (confidence, supersession) |
| **Scheduled tasks** | Cron-based tasks with full persistence and group scoping |
| **Voice transcription** | Whisper API (cloud) or local whisper.cpp (Apple Silicon) |
| **Wet-lab image analysis** | Gel, blot, colony plate images analysed by Claude vision |
| **Path guard** | Prevents agent access to sensitive system paths |
| **SSH from chat** | Type `ssh <alias>` or `ssh <alias> -- <cmd>` directly in chat |
| **Multi-thread web UI** | Separate conversation threads, each with isolated memory |

---

## Security & Privacy

- No telemetry. No cloud storage. No third-party data sharing.
- All agent execution happens inside isolated Linux containers
- API credentials injected via stdin — never stored on disk inside the container
- Path guard blocks agent access to `.ssh`, `.aws`, `.env`, and credential files
- Built-in PHI detection and redaction hook (HIPAA-aware)
- Audit logging support for regulated environments (21 CFR Part 11)
- Per-group container isolation — one group cannot access another's data

---

## Project Structure

```
ANUClaw/
├── src/
│   ├── index.ts              # Orchestrator: channel boot, hook pipeline, agent dispatch
│   ├── config.ts             # Environment + config loading (fully typed)
│   ├── hooks.ts              # Hook engine — 5 events, 3 outcomes, built-in guards
│   ├── memory.ts             # Dual-layer memory + context compaction
│   ├── router.ts             # Outbound routing with per-channel length limits
│   ├── container-runner.ts   # Container lifecycle, SOUL injection, credential proxy
│   ├── path-guard.ts         # Sensitive path blocking
│   ├── soul.ts               # 3-level SOUL.md loader (per-group → config → default)
│   ├── task-scheduler.ts     # Cron-based scheduled task runner
│   ├── logger.ts             # Structured logger with file output
│   ├── db/                   # SQLite schema + CRUD (messages, sessions, memory, tasks, traces)
│   └── channels/             # 14 channel adapters (self-registering at startup)
│       ├── telegram/
│       ├── discord/
│       ├── slack/
│       ├── feishu/
│       ├── dingtalk/
│       ├── signal/
│       ├── matrix/
│       ├── irc/
│       ├── nostr/
│       ├── email/
│       ├── whatsapp/         # lazy-loaded
│       ├── imessage/         # macOS only
│       ├── qq/               # conditional
│       └── local-web/
├── container/
│   ├── Dockerfile            # Ubuntu 24.04 + full bio/pharma/clinical stack
│   ├── build.sh              # Auto-detects Docker vs Apple Container
│   └── skills/               # 1100+ SKILL.md domain skill modules
├── groups/                   # Per-group isolated workspaces (created at runtime)
├── scripts/
│   └── setup.ps1             # Windows PowerShell setup
├── SOUL.md                   # Default agent personality
├── CLAUDE.md                 # Developer architecture guide
├── setup.sh                  # One-command setup (macOS/Linux)
└── .env.example              # All supported environment variables documented
```

---

## Citation

If you use ANUClaw in research, please cite:

```bibtex
@software{anuclaw2026,
  title   = {ANUClaw: Unified AI Research and Medical Assistant Platform},
  author  = {AMGI Research, Abi and Anu},
  year    = {2026},
  url     = {https://github.com/amgi-research/ANUClaw}
}
```

---

## About AMGI

**AMGI** (Abi and Anu Research Initiative) is an independent research group focused on building open, practical AI tooling for scientific and medical communities.

ANUClaw is designed and built entirely by AMGI — from the multi-channel runtime architecture, to the hook engine, to the 1100+ domain skill library.

---

## License

MIT — see [LICENSE](LICENSE)

© 2026 AMGI Research — Abi and Anu
