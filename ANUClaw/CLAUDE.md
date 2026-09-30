# ANUClaw

Unified AI research & medical assistant built from scratch by AMGI (Abi and Anu). See [README.md](README.md).

## Quick Context

Single Node.js/TypeScript process. All 14 channels self-register at startup. Messages flow through a 5-event hook engine, then route to Claude Agent SDK running in isolated containers pre-loaded with 1100+ domain skills. Each group has isolated filesystem and memory. Dual-layer memory: per-group `AGENTS.md` file + structured SQLite fact store.

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator: channel boot, main agent loop, hook pipeline |
| `src/config.ts` | All env/config loading with defaults |
| `src/hooks.ts` | Hook engine — BeforeMessage, BeforeLLMCall, BeforeToolCall, AfterToolCall, AfterMessage |
| `src/memory.ts` | Dual-layer memory: file (AGENTS.md) + SQLite structured facts |
| `src/router.ts` | Message formatting, media handling, outbound routing |
| `src/container-runner.ts` | Container lifecycle, output streaming, timeouts |
| `src/container-runtime.ts` | Low-level container spawn args |
| `src/credential-proxy.ts` | Secret injection via stdin — never written to disk |
| `src/path-guard.ts` | Block access to .ssh, .aws, .env, credentials |
| `src/task-scheduler.ts` | Cron-based scheduled task runner |
| `src/ipc.ts` | IPC watcher and task processing |
| `src/db/connection.ts` | SQLite init + schema migrations |
| `src/db/messages.ts` | Chat message CRUD |
| `src/db/groups.ts` | Registered group CRUD |
| `src/db/sessions.ts` | Session persistence (full message history) |
| `src/db/tasks.ts` | Scheduled task CRUD |
| `src/db/memory-store.ts` | Structured memory facts (confidence, supersession) |
| `src/channels/registry.ts` | Channel factory + lifecycle management |
| `src/channels/types.ts` | Shared channel interface |
| `groups/{name}/AGENTS.md` | Per-group file memory (isolated) |
| `SOUL.md` | Default agent personality injected into system prompt |

## Channel Files

| File | Channel |
|------|---------|
| `src/channels/whatsapp/channel.ts` | WhatsApp (baileys, QR auth) |
| `src/channels/telegram/channel.ts` | Telegram (node-telegram-bot-api) |
| `src/channels/discord/channel.ts` | Discord (discord.js) |
| `src/channels/slack/channel.ts` | Slack (Socket Mode) |
| `src/channels/feishu/channel.ts` | Feishu/Lark (WebSocket) |
| `src/channels/dingtalk/channel.ts` | DingTalk (Stream mode) |
| `src/channels/email/channel.ts` | Gmail (OAuth2) |
| `src/channels/signal/channel.ts` | Signal (signal-cli) |
| `src/channels/matrix/channel.ts` | Matrix (matrix-js-sdk) |
| `src/channels/imessage/channel.ts` | iMessage (AppleScript, macOS only) |
| `src/channels/irc/channel.ts` | IRC (irc-framework) |
| `src/channels/nostr/channel.ts` | Nostr (nostr-tools) |
| `src/channels/qq/channel.ts` | QQ (OpenShamrock) |
| `src/channels/local-web/channel.ts` | Local web UI (Express + SSE) |

## Container Tools

### CLI Tools
| Tool | Command | Purpose |
|------|---------|---------|
| BLAST+ | `blastn`, `blastp`, `blastx` | Sequence similarity search |
| SAMtools | `samtools` | SAM/BAM manipulation |
| BEDTools | `bedtools` | Genome arithmetic |
| BWA | `bwa` | Short-read alignment |
| minimap2 | `minimap2` | Long-read alignment |
| FastQC | `fastqc` | Sequencing QC |
| seqtk | `seqtk` | FASTA/FASTQ toolkit |
| bcftools | `bcftools` | VCF/BCF manipulation |
| GATK | `gatk` | Variant calling |
| snakemake | `snakemake` | Workflow management |
| nextflow | `nextflow` | Pipeline orchestration |
| AutoDock Vina | `vina` | Molecular docking |
| OpenBabel | `obabel` | Chemical format conversion |

### Python Libraries
| Library | Domain |
|---------|--------|
| BioPython | Bioinformatics core |
| scanpy, AnnData | Single-cell analysis |
| PyDESeq2 | Differential expression |
| pysam | SAM/BAM Python access |
| RDKit | Cheminformatics |
| DeepChem | ML for drug discovery |
| datamol, molfeat | Molecular ML prep |
| PyTDC | Therapeutics data |
| AlphaFold (api) | Structure prediction |
| pyhealth | Clinical ML |
| fhir.resources | FHIR/HL7 parsing |
| pandas, numpy, scipy | Data science core |
| matplotlib, seaborn, plotly | Visualization |
| scikit-learn | ML |
| statsmodels | Statistical modeling |
| lifelines | Survival analysis |
| pymc | Bayesian modeling |

## Hook System

```typescript
// Hook events
type HookEvent = 
  | 'BeforeMessage'      // inbound message received
  | 'BeforeLLMCall'      // about to call LLM
  | 'BeforeToolCall'     // agent about to execute a tool
  | 'AfterToolCall'      // tool returned a result
  | 'AfterMessage'       // response sent back to channel

// Hook outcomes
type HookOutcome = 'allow' | 'block' | 'modify'
```

Add hooks in `src/hooks.ts`. Each hook receives the full context and returns an outcome.

## Memory System

```
File memory:   groups/{chat_id}/AGENTS.md   (append-only facts, agent-written)
SQLite memory: db.memory_facts table        (structured: key, value, confidence, superseded_by)
```

Use `src/memory.ts` functions: `readMemory()`, `writeMemory()`, `upsertFact()`, `getFacts()`.

## SOUL.md

Place `SOUL.md` at project root (or per-group at `groups/{id}/SOUL.md`) to customize the agent's personality, voice, and working style. Content is injected into every system prompt inside `<soul>` tags.

## Skills

Skills are loaded from `container/skills/` into every agent container. Skills are plain `SKILL.md` markdown files — no code changes needed to add them.

ClawHub-compatible: run `npm run skills:search <query>` or `npm run skills:install <slug>`.

## Development

```bash
npm run dev          # Hot reload dev mode
npm run build        # Compile TypeScript
npm run test         # Run test suite
npm run lint         # ESLint
npm run container    # Rebuild agent container
npm run skills:list  # List installed skills
npm run skills:search <q>  # Search ClawHub
```

## Environment Variables

See `.env.example` for the full list. Key groups:
- `ANTHROPIC_API_KEY` — Claude (default provider)
- `MODEL_PROVIDER` — anthropic | openrouter | openai-compatible | openai-codex | ollama
- Channel tokens: `TELEGRAM_BOT_TOKEN`, `DISCORD_BOT_TOKEN`, `SLACK_BOT_TOKEN`, etc.
- `HOOKS_ENABLED` — true/false
- `SOUL_PATH` — path to SOUL.md override
- `WHISPER_API_KEY` — for voice transcription
- `MAX_SESSION_MESSAGES` — context compaction threshold (default: 80)
- `CONTAINER_TIMEOUT_MS` — agent container timeout (default: 300000)

## Container Build Cache

Buildkit caches aggressively. For a clean rebuild:
```bash
docker builder prune -f
./container/build.sh
```

## Adding a Skill

Drop a `SKILL.md` file into `container/skills/<skill-name>/SKILL.md`. Rebuild the container. Skills auto-load on next session.

## Adding a Hook

Edit `src/hooks.ts`. Add a handler to the appropriate event array. Hooks run in registration order.

## Adding a Channel

1. Create `src/channels/<name>/channel.ts` implementing `IChannel`
2. Import and register in `src/channels/registry.ts`
3. Add credentials to `.env.example`
