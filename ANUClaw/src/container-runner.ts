import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { config } from './config';
import { logger } from './logger';
import { buildMemoryContext, saveMemory, compactMessages, Message } from './memory';
import { loadSoul } from './soul';
import { retrieveContext } from './rag';
import axios from 'axios';

export interface RunAgentOptions {
  groupId: string;
  channel?: string;
  prompt: string;
  /** Previous session messages for context */
  sessionMessages?: Message[];
  /** Path to media file (image/voice/video) */
  mediaPath?: string;
  mediaType?: 'image' | 'voice' | 'video' | 'document';
  /** Override the SOUL for this run */
  soulOverride?: string;
  maxTurns?: number;
  onChunk?: (text: string) => void;
}

export interface AgentResult {
  text: string;
  /** Any file paths produced by the agent */
  artifacts: string[];
  error?: string;
}

export async function runAgent(opts: RunAgentOptions): Promise<AgentResult> {
  const groupDir = path.join(config.agent.groupsDir, opts.groupId);
  fs.mkdirSync(groupDir, { recursive: true });

  const workDir = path.join(config.agent.workspaceDir, opts.groupId);
  fs.mkdirSync(workDir, { recursive: true });

  // Build session with compaction
  let messages = opts.sessionMessages ?? [];
  if (messages.length > config.agent.maxSessionMessages) {
    messages = compactMessages(messages, config.agent.maxSessionMessages);
  }

  // Build system prompt
  const soul = opts.soulOverride ?? (await loadSoul(opts.groupId));
  const memoryContext = await buildMemoryContext(opts.groupId, opts.prompt);
  const ragContext = await retrieveContext(opts.prompt, opts.groupId);
  const systemPrompt = buildSystemPrompt(soul, memoryContext, ragContext);

  // Write context files for the container
  const contextFile = path.join(groupDir, '.anuclaw_context.json');
  fs.writeFileSync(
    contextFile,
    JSON.stringify({ systemPrompt, sessionMessages: messages, prompt: opts.prompt, mediaPath: opts.mediaPath, mediaType: opts.mediaType }),
    'utf8',
  );

  // Detect container runtime (docker / apple container)
  const runtime = detectRuntime();

  const args = buildContainerArgs(runtime, groupDir, workDir, opts);

  return new Promise((resolve) => {
    let proc: any;
    let fallbackTriggered = false;
    const output: string[] = [];
    const errors: string[] = [];
    let timedOut = false;
    let timer: NodeJS.Timeout;

    const startFallback = (reason: string) => {
      if (fallbackTriggered) return;
      fallbackTriggered = true;
      if (timer) clearTimeout(timer);
      logger.info(`${reason}. Falling back to host LLM direct execution...`);
      runLocalLLMFallback(systemPrompt, messages, opts, workDir).then(resolve);
    };

    try {
      proc = spawn(runtime, args, { stdio: ['pipe', 'pipe', 'pipe'] });

      timer = setTimeout(() => {
        timedOut = true;
        if (proc) proc.kill('SIGTERM');
        logger.warn(`Agent container timed out for group ${opts.groupId}`);
      }, config.agent.containerTimeoutMs);

      proc.on('error', (err: any) => {
        startFallback(`Container spawn failed: ${err.message}`);
      });

      proc.stdout.on('data', (d: Buffer) => {
        const chunk = d.toString();
        output.push(chunk);
        if (opts.onChunk) {
          opts.onChunk(chunk);
        }
      });
      proc.stderr.on('data', (d: Buffer) => errors.push(d.toString()));

      proc.on('close', (code: number) => {
        if (fallbackTriggered) return;
        clearTimeout(timer);
        const rawOutput = output.join('');
        const rawErrors = errors.join('');

        if (code !== 0 || rawErrors.includes('failed to connect') || rawErrors.includes('Cannot connect to the Docker daemon')) {
          startFallback(`Container exited with code ${code} or daemon connection failure`);
          return;
        }

        const artifacts = extractArtifacts(rawOutput, workDir);

        if (timedOut) {
          resolve({ text: 'The agent took too long and was stopped. Try a simpler request or break it into smaller steps.', artifacts: [] });
          return;
        }

        const text = parseAgentOutput(rawOutput);

        runVerificationLoop(opts.prompt, text, systemPrompt, messages).then((verifiedText) => {
          saveMemory(
            opts.groupId,
            `User: ${opts.prompt}\n\nAssistant: ${verifiedText}`,
            { channel: opts.channel ?? 'api', timestamp: new Date().toISOString() },
          ).catch(() => {});

          resolve({ text: verifiedText, artifacts });
        });
      });

      const credentials = buildCredentialsPayload();
      proc.stdin.write(credentials);
      proc.stdin.end();

    } catch (err: any) {
      startFallback(`Spawn setup failed: ${err.message}`);
    }
  });
}

function detectRuntime(): string {
  // Prefer apple container on macOS if available
  if (process.platform === 'darwin') {
    try {
      const { execSync } = require('child_process') as typeof import('child_process');
      execSync('container --version', { stdio: 'ignore' });
      return 'container';
    } catch {
      return 'docker';
    }
  }
  return 'docker';
}

function buildContainerArgs(runtime: string, groupDir: string, workDir: string, opts: RunAgentOptions): string[] {
  const skillsDir = path.join(__dirname, '..', 'container', 'skills');
  const baseArgs = [
    'run', '--rm', '--interactive',
    '--name', `anuclaw-${opts.groupId.slice(0, 20)}-${Date.now()}`,
    '--memory', '4g',
    '--cpus', '2',
    '-v', `${groupDir}:/workspace/group`,
    '-v', `${workDir}:/workspace/output`,
    '-v', `${skillsDir}:/workspace/skills:ro`,
    '-e', 'ANTHROPIC_API_KEY',
    '-e', 'ANUCLAW_AGENT=1',
    config.agent.containerImage,
    'claude', '--dangerously-skip-permissions',
  ];
  if (opts.maxTurns) {
    baseArgs.push('--max-turns', String(opts.maxTurns));
  }
  return baseArgs;
}

function buildCredentialsPayload(): string {
  const creds: Record<string, string> = {
    MODEL_PROVIDER: config.llm.provider,
  };

  if (config.llm.provider === 'openrouter') {
    // Claude Code CLI routes to OpenRouter via ANTHROPIC_BASE_URL + ANTHROPIC_API_KEY
    creds.ANTHROPIC_API_KEY      = config.llm.openrouterApiKey ?? '';
    creds.ANTHROPIC_BASE_URL     = config.llm.openrouterBaseUrl ?? 'https://openrouter.ai/api/v1';
    creds.OPENROUTER_API_KEY     = config.llm.openrouterApiKey ?? '';
    creds.OPENROUTER_MODEL       = config.llm.openrouterModel ?? 'anthropic/claude-sonnet-4-6';
    creds.CLAUDE_MODEL           = config.llm.openrouterModel ?? 'anthropic/claude-sonnet-4-6';
  } else if (config.llm.provider === 'openai-compatible') {
    creds.ANTHROPIC_API_KEY      = config.llm.openaiCompatibleApiKey ?? '';
    creds.ANTHROPIC_BASE_URL     = config.llm.openaiCompatibleBaseUrl ?? '';
    creds.CLAUDE_MODEL           = config.llm.openaiCompatibleModel ?? '';
  } else {
    creds.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
  }

  return JSON.stringify(creds) + '\n';
}

function buildSystemPrompt(soul: string, memoryContext: string, ragContext: string): string {
  const parts: string[] = [];

  if (soul.trim()) {
    parts.push(`<soul>\n${soul}\n</soul>`);
  }

  if (memoryContext.trim()) {
    parts.push(`<memory>\n${memoryContext}\n</memory>`);
  }

  if (ragContext.trim()) {
    parts.push(`<retrieved_rag_context>\n${ragContext}\n</retrieved_rag_context>`);
  }

  parts.push(`You are ANUClaw — a unified AI research and medical assistant.
You have access to 1100+ domain skills covering genomics, drug discovery, clinical medicine, lab automation, XR, and regulatory compliance.
Skills are loaded from /workspace/skills/ — read SKILL.md files to understand available capabilities.
Output files to /workspace/output/ and they will be delivered back to the user.
Be precise, cite sources, and always clarify when an output is a prioritisation signal rather than experimental proof.`);

  return parts.join('\n\n');
}

function parseAgentOutput(raw: string): string {
  // Extract text between <response> tags if present, otherwise return trimmed output
  const match = raw.match(/<response>([\s\S]*?)<\/response>/i);
  if (match) return match[1].trim();
  return raw.trim() || '(No response generated)';
}

function extractArtifacts(output: string, workDir: string): string[] {
  if (!fs.existsSync(workDir)) return [];
  const files = fs.readdirSync(workDir);
  return files
    .filter((f) => !f.startsWith('.'))
    .map((f) => path.join(workDir, f));
}

async function runLocalLLMFallback(
  systemPrompt: string,
  sessionMessages: Message[],
  opts: RunAgentOptions,
  workDir: string,
): Promise<AgentResult> {
  const provider = config.llm.provider;
  let text = '';
  let errorMsg: string | undefined = undefined;

  try {
    const enrichedSystem = `${systemPrompt}

[SYSTEM DIRECTIVE (LOCAL FALLBACK MODE):
Docker container execution is currently unavailable in this environment.
You are running directly on the host using your internal capabilities.
Please perform the requested analysis (clinical risk, genomic variants, trial matching, regulatory audit, etc.) to the absolute best of your knowledge.
If the user requested creating a file, document, or report, format the files exactly as follows in your text response. The host runner will extract them and write them to the filesystem so they are delivered back to the user:

[FILE_START: filename.txt]
<content of the file here>
[FILE_END]

Examples of files you can save:
- Clinical reports: "genomic_report.txt", "discharge_summary_simplified.txt", etc.
- Data sheets: "admet_predictions.csv", "variants_filtered.vcf", etc.
Do not use subdirectories in the filename (just use "filename.txt"), and make sure the file is printed completely inside the [FILE_START] and [FILE_END] blocks.]`;

    const formattedMsgs = sessionMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    formattedMsgs.push({ role: 'user', content: opts.prompt });

    if (provider === 'openrouter') {
      const url = config.llm.openrouterBaseUrl || 'https://openrouter.ai/api/v1';
      const apiKey = config.llm.openrouterApiKey || '';
      const model = config.llm.openrouterModel || 'anthropic/claude-sonnet-4-6';

      const response = await axios.post(
        `${url}/chat/completions`,
        {
          model,
          messages: [
            {
              role: 'system',
              content: [
                {
                  type: 'text',
                  text: enrichedSystem,
                  cache_control: { type: 'ephemeral' } // CAG Cache-control flag
                }
              ]
            },
            ...formattedMsgs,
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
        },
      );

      const rawText = response.data?.choices?.[0]?.message?.content ?? '';
      text = await runVerificationLoop(opts.prompt, rawText, systemPrompt, sessionMessages);
    } else {
      text = `Local fallback mode is only supported with OpenRouter configured currently. Conf provider: ${provider}`;
    }

    // Parse and save files from verified response
    const fileRegex = /\[FILE_START:\s*([a-zA-Z0-9_\-\.]+)\s*\]([\s\S]*?)\[FILE_END\]/g;
    let match;
    while ((match = fileRegex.exec(text)) !== null) {
      const fileName = match[1].trim();
      const fileContent = match[2].trim();
      const filePath = path.join(workDir, fileName);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, fileContent, 'utf8');
      logger.info(`Locally saved simulated file: ${filePath}`);
    }

  } catch (err: any) {
    const msg = err.response?.data?.error?.message ?? err.message;
    text = `Error running agent locally: ${msg}`;
    errorMsg = msg;
  }

  const artifacts = extractArtifacts('', workDir);

  return { text, artifacts, error: errorMsg };
}

async function runVerificationLoop(
  userPrompt: string,
  initialText: string,
  systemPrompt: string,
  sessionMessages: Message[]
): Promise<string> {
  const provider = config.llm.provider;
  if (provider !== 'openrouter') return initialText;

  const url = config.llm.openrouterBaseUrl || 'https://openrouter.ai/api/v1';
  const apiKey = config.llm.openrouterApiKey || '';
  const model = config.llm.openrouterModel || 'anthropic/claude-sonnet-4-6';

  const critiquePrompt = `You are a clinical quality assurance agent.
Review the following generated analysis/response for safety, accuracy, and formatting compliance.

User Request:
"""
${userPrompt}
"""

Generated Response:
"""
${initialText}
"""

Verification Criteria:
1. Check for critical drug-drug or gene-drug interactions (e.g. CYP2D6 Poor Metabolizer must NOT receive codeine or tramadol).
2. Ensure patient-facing language is clear, simple, and free of unnecessary jargon.
3. Ensure structured formats like FHIR JSON or HL7 messages are fully valid and complete.
4. Verify that clinical claims are backed by references.

Task:
If there are any violations, errors, or formatting issues, output the corrected response in full, enclosed in <response>...</response>.
If the response is fully correct and compliant, output the original response in full, enclosed in <response>...</response>.`;

  try {
    logger.info('Starting Agentic Critique & Verification Loop...');
    const response = await axios.post(
      `${url}/chat/completions`,
      {
        model,
        messages: [
          {
            role: 'system',
            content: [
              {
                type: 'text',
                text: 'You are a strict QA clinical auditor.',
                cache_control: { type: 'ephemeral' } // CAG Cache-control flag
              }
            ]
          },
          { role: 'user', content: critiquePrompt }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        }
      }
    );

    const critiqueResult = response.data?.choices?.[0]?.message?.content ?? '';
    const match = critiqueResult.match(/<response>([\s\S]*?)<\/response>/i);
    if (match) {
      const verifiedText = match[1].trim();
      if (verifiedText && verifiedText !== initialText) {
        logger.info('Critique & Verification Loop successfully refined the response.');
        return verifiedText;
      }
    }
    logger.info('Critique & Verification Loop completed. Output verified.');
  } catch (err: any) {
    logger.error('Critique & Verification Loop failed:', err.message);
  }

  return initialText;
}
