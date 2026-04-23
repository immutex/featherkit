import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { VerificationRunCheckResult } from '../../config/schema.js';
import { runSubprocess } from '../subprocess.js';

export async function runTests(cwd: string, options?: { env?: NodeJS.ProcessEnv }): Promise<VerificationRunCheckResult> {
  const packageJsonPath = join(cwd, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return { status: 'skipped', output: 'No package.json found.', durationMs: 0 };
  }

  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as { scripts?: Record<string, string> };
  if (!packageJson.scripts?.test) {
    return { status: 'skipped', output: 'No test script found in package.json.', durationMs: 0 };
  }

  const testScript = packageJson.scripts.test;
  const useBun = /\bbun\s+test\b/.test(testScript);
  const command = useBun ? 'bun' : 'npm';
  const args = ['test'];
  const startedAt = Date.now();
  const result = await runSubprocess(command, args, { cwd, env: options?.env });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim() || undefined;

  return {
    status: result.exitCode === 0 ? 'pass' : 'fail',
    output,
    durationMs: Date.now() - startedAt,
  };
}
