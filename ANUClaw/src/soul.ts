import * as fs from 'fs';
import * as path from 'path';
import { config } from './config';

const DEFAULT_SOUL_PATH = path.resolve('./SOUL.md');

export async function loadSoul(groupId?: string): Promise<string> {
  // 1. Per-group override
  if (groupId) {
    const groupSoul = path.join(config.agent.groupsDir, groupId, 'SOUL.md');
    if (fs.existsSync(groupSoul)) return fs.readFileSync(groupSoul, 'utf8');
  }

  // 2. Configured soul_path
  if (config.soulPath && fs.existsSync(config.soulPath)) {
    return fs.readFileSync(config.soulPath, 'utf8');
  }

  // 3. Default SOUL.md at project root
  if (fs.existsSync(DEFAULT_SOUL_PATH)) {
    return fs.readFileSync(DEFAULT_SOUL_PATH, 'utf8');
  }

  return '';
}
