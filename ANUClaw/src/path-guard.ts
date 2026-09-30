import * as path from 'path';

const BLOCKED_PATTERNS: RegExp[] = [
  /\.ssh/i,
  /\.aws/i,
  /\.gnupg/i,
  /\.env/,
  /credentials/i,
  /secret/i,
  /private[_-]?key/i,
  /id_rsa/i,
  /id_ed25519/i,
  /\.npmrc/i,
  /\.pypirc/i,
  /keychain/i,
  /wallet\.dat/i,
  /shadow/i,
  /passwd/i,
  /\/etc\/hosts/i,
];

const BLOCKED_DIRS: string[] = [
  '/etc/shadow',
  '/etc/passwd',
  '/root/.ssh',
  '/root/.aws',
];

/**
 * Returns true if the given file path is blocked for security reasons.
 * Called before any file read/write tool executes.
 */
export function isPathBlocked(filePath: string): boolean {
  const normalised = path.normalize(filePath).replace(/\\/g, '/');

  for (const blocked of BLOCKED_DIRS) {
    if (normalised.startsWith(blocked)) return true;
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(normalised)) return true;
  }

  // Block absolute paths that escape the workspace
  if (path.isAbsolute(normalised)) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
    const sensitiveRoots = [
      path.join(home, '.ssh'),
      path.join(home, '.aws'),
      path.join(home, '.gnupg'),
    ];
    for (const root of sensitiveRoots) {
      if (normalised.startsWith(root.replace(/\\/g, '/'))) return true;
    }
  }

  return false;
}

export function assertPathAllowed(filePath: string): void {
  if (isPathBlocked(filePath)) {
    throw new Error(`Path blocked by ANUClaw security guard: ${filePath}`);
  }
}
