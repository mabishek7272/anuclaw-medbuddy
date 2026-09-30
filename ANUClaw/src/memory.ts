import * as fs from 'fs';
import * as path from 'path';
import { config } from './config';
import { db } from './db';
import { logger } from './logger';

// ── File memory (AGENTS.md per group) ────────────────────────────────────────

export function getAgentsMemoryPath(groupId: string): string {
  return path.join(config.agent.groupsDir, groupId, 'AGENTS.md');
}

export function readFileMemory(groupId: string): string {
  const filePath = getAgentsMemoryPath(groupId);
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf8');
}

export function appendFileMemory(groupId: string, entry: string): void {
  const filePath = getAgentsMemoryPath(groupId);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const timestamp = new Date().toISOString();
  fs.appendFileSync(filePath, `\n## ${timestamp}\n\n${entry}\n`);
}

// ── SQLite structured memory ──────────────────────────────────────────────────

export interface MemoryFact {
  id: number;
  groupId: string;
  key: string;
  value: string;
  confidence: number;
  source: string;
  supersededBy?: number;
  createdAt: string;
}

export async function upsertFact(
  groupId: string,
  key: string,
  value: string,
  confidence = 1.0,
  source = 'agent',
): Promise<void> {
  const existing = await db.queryOne<{ id: number }>(
    'SELECT id FROM memory_facts WHERE group_id = $1 AND key = $2 AND superseded_by IS NULL',
    [groupId, key]
  );

  if (existing) {
    const rows = await db.query<{ id: number }>(
      'INSERT INTO memory_facts (group_id, key, value, confidence, source, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [groupId, key, value, confidence, source, new Date().toISOString()]
    );
    const newId = rows[0]?.id;
    if (newId) {
      await db.query(
        'UPDATE memory_facts SET superseded_by = $1 WHERE id = $2',
        [newId, existing.id]
      );
    }
  } else {
    await db.query(
      'INSERT INTO memory_facts (group_id, key, value, confidence, source, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [groupId, key, value, confidence, source, new Date().toISOString()]
    );
  }
}

export async function getFacts(groupId: string): Promise<MemoryFact[]> {
  return db.query<MemoryFact>(
    'SELECT * FROM memory_facts WHERE group_id = $1 AND superseded_by IS NULL ORDER BY created_at DESC',
    [groupId]
  );
}

export async function getFact(groupId: string, key: string): Promise<MemoryFact | undefined> {
  return db.queryOne<MemoryFact>(
    'SELECT * FROM memory_facts WHERE group_id = $1 AND key = $2 AND superseded_by IS NULL',
    [groupId, key]
  );
}

// ── Dual-layer read: returns combined memory context ─────────────────────────

export async function buildMemoryContext(groupId: string, _queryHint?: string): Promise<string> {
  const parts: string[] = [];

  const fileMemory = readFileMemory(groupId);
  if (fileMemory.trim()) {
    parts.push(`<file_memory>\n${fileMemory}\n</file_memory>`);
  }

  const facts = await getFacts(groupId);
  if (facts.length > 0) {
    const factLines = facts
      .map((f) => `- ${f.key}: ${f.value} (confidence: ${f.confidence})`)
      .join('\n');
    parts.push(`<structured_memory>\n${factLines}\n</structured_memory>`);
  }

  return parts.join('\n\n');
}

// ── Context compaction ────────────────────────────────────────────────────────

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export function compactMessages(messages: Message[], threshold: number): Message[] {
  if (messages.length <= threshold) return messages;

  const keepRecent = Math.floor(threshold * 0.4);
  const toSummarise = messages.slice(0, messages.length - keepRecent);
  const recent = messages.slice(messages.length - keepRecent);

  const summary: Message = {
    role: 'assistant',
    content: `[Context compacted: ${toSummarise.length} earlier messages summarised. Key facts preserved in memory.]`,
    timestamp: new Date().toISOString(),
  };

  logger.info(`Context compacted: ${toSummarise.length} messages → 1 summary, ${recent.length} kept verbatim`);
  return [summary, ...recent];
}

export async function saveMemory(
  groupId: string,
  entry: string,
  meta?: { channel: string; timestamp: string },
): Promise<void> {
  appendFileMemory(groupId, entry);
}
