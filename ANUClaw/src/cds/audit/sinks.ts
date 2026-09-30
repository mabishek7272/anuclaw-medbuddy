/**
 * Audit storage backends (plan §5.4 "Immutability: append-only store").
 *
 * Both sinks are append-only — they expose no update or delete. The file sink
 * persists one JSON object per line (JSONL), which is naturally append-only and
 * survives process restarts.
 */

import * as fs from 'fs';
import { AuditEntry, AuditSink } from './types';

/** In-memory append-only sink (default; entries are frozen on append). */
export class InMemoryAuditSink implements AuditSink {
  private readonly store: AuditEntry[] = [];

  append(entry: AuditEntry): void {
    this.store.push(Object.freeze({ ...entry }));
  }

  all(): AuditEntry[] {
    return this.store.slice();
  }

  head(): AuditEntry | null {
    return this.store.length ? this.store[this.store.length - 1] : null;
  }
}

/** Append-only JSONL file sink — durable across restarts. */
export class FileAuditSink implements AuditSink {
  constructor(private readonly path: string) {}

  append(entry: AuditEntry): void {
    fs.appendFileSync(this.path, JSON.stringify(entry) + '\n', 'utf8');
  }

  all(): AuditEntry[] {
    if (!fs.existsSync(this.path)) return [];
    return fs
      .readFileSync(this.path, 'utf8')
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as AuditEntry);
  }

  head(): AuditEntry | null {
    const all = this.all();
    return all.length ? all[all.length - 1] : null;
  }
}
