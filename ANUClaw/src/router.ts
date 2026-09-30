import * as fs from 'fs';
import * as path from 'path';
import { IChannel, OutboundMessage } from './channels/types';
import { logger } from './logger';

const MAX_TEXT_LENGTH: Record<string, number> = {
  telegram: 4096,
  discord: 2000,
  slack: 4000,
  feishu: 4096,
  dingtalk: 4096,
  email: 100_000,
  signal: 2000,
  matrix: 20_000,
  irc: 450,
  nostr: 10_000,
  web: 100_000,
  whatsapp: 4096,
  imessage: 10_000,
  qq: 4096,
};

const MEDIA_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.csv', '.tsv', '.txt', '.html'];

export async function routeResponse(
  channel: IChannel,
  groupId: string,
  text: string,
  artifacts: string[],
): Promise<void> {
  const maxLen = MAX_TEXT_LENGTH[channel.name] ?? 4096;

  // Send text response (split if needed)
  const chunks = splitText(text, maxLen);
  for (const chunk of chunks) {
    const msg: OutboundMessage = { groupId, channel: channel.name, text: chunk };
    await channel.send(msg).catch((err) => logger.error(`Failed to send to ${channel.name}:`, err));
  }

  // Send artifacts
  for (const artifactPath of artifacts) {
    const ext = path.extname(artifactPath).toLowerCase();
    if (MEDIA_EXTENSIONS.includes(ext) && fs.existsSync(artifactPath)) {
      const msg: OutboundMessage = {
        groupId,
        channel: channel.name,
        text: `📎 ${path.basename(artifactPath)}`,
        filePath: artifactPath,
        mimeType: getMimeType(ext),
      };
      await channel.send(msg).catch((err) => logger.error(`Failed to send artifact to ${channel.name}:`, err));
    }
  }
}

function splitText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) { chunks.push(remaining); break; }
    let cutAt = remaining.lastIndexOf('\n', maxLen);
    if (cutAt <= 0) cutAt = maxLen;
    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt).trimStart();
  }
  return chunks;
}

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.csv': 'text/csv',
    '.tsv': 'text/tab-separated-values',
    '.txt': 'text/plain',
    '.html': 'text/html',
  };
  return map[ext] ?? 'application/octet-stream';
}
