import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { VerificationRunCheckResult } from '../../config/schema.js';
import { runSubprocess } from '../subprocess.js';

export async function runTypecheck(cwd: string, options?: { env?: NodeJS.ProcessEnv }): Promise<VerificationRunCheckResult> {
  if (!existsSync(join(cwd, 'tsconfig.json'))) {
    return { status: 'skipped', output: 'No tsconfig.json found.', durationMs: 0 };
  }

  const localTsc = join(cwd, 'node_modules', '.bin', 'tsc');
  const command = existsSync(localTsc) ? localTsc : 'npx';
  const args = existsSync(localTsc) ? ['--noEmit'] : ['tsc', '--noEmit'];
  const startedAt = Date.now();
  const result = await runSubprocess(command, args, { cwd, env: options?.env });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim() || undefined;

  return {
    status: result.exitCode === 0 ? 'pass' : 'fail',
    output,
    durationMs: Date.now() - startedAt,
  };
}
