import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { VerificationRunCheckResult } from '../../config/schema.js';
import { runSubprocess } from '../subprocess.js';

async function findNearestPackageJson(cwd: string): Promise<{ dir: string; scripts?: Record<string, string> } | null> {
  let current = cwd;

  while (true) {
    const packageJsonPath = join(current, 'package.json');
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as { scripts?: Record<string, string> };
      return { dir: current, scripts: packageJson.scripts };
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export async function runBuild(cwd: string, options?: { env?: NodeJS.ProcessEnv }): Promise<VerificationRunCheckResult> {
  const pkg = await findNearestPackageJson(cwd);
  if (!pkg?.scripts?.build) {
    return { status: 'skipped', output: 'No build script found in the nearest package.json.', durationMs: 0 };
  }

  const useBun = existsSync(join(pkg.dir, 'bun.lock')) || existsSync(join(pkg.dir, 'bun.lockb'));
  const command = useBun ? 'bun' : 'npm';
  const args = ['run', 'build'];
  const startedAt = Date.now();
  const result = await runSubprocess(command, args, { cwd: pkg.dir, env: options?.env });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim() || undefined;

  return {
    status: result.exitCode === 0 ? 'pass' : 'fail',
    output,
    durationMs: Date.now() - startedAt,
  };
}
