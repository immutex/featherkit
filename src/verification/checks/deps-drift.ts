import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { VerificationRunCheckResult } from '../../config/schema.js';
import { runSubprocess } from '../subprocess.js';

function findPackageRoot(cwd: string): string | null {
  let current = cwd;

  while (true) {
    if (existsSync(join(current, 'package.json'))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export async function runDepsDrift(cwd: string, options?: { env?: NodeJS.ProcessEnv }): Promise<VerificationRunCheckResult> {
  const root = findPackageRoot(cwd);
  if (!root || !existsSync(join(root, 'package.json'))) {
    return { status: 'skipped', output: 'No package.json found.', durationMs: 0 };
  }

  if (!existsSync(join(root, 'bun.lock')) && !existsSync(join(root, 'bun.lockb'))) {
    return { status: 'skipped', output: 'No Bun lockfile found for frozen-lockfile verification.', durationMs: 0 };
  }

  const startedAt = Date.now();
  const result = await runSubprocess('bun', ['install', '--frozen-lockfile', '--dry-run'], { cwd: root, env: options?.env });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim() || undefined;

  return {
    status: result.exitCode === 0 ? 'pass' : 'fail',
    output,
    durationMs: Date.now() - startedAt,
  };
}
