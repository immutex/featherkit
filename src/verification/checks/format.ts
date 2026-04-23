import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { VerificationRunCheckResult } from '../../config/schema.js';
import { runSubprocess } from '../subprocess.js';

async function detectFormatter(cwd: string): Promise<{ command: string; args: string[]; label: string } | null> {
  const packageJsonPath = join(cwd, 'package.json');
  const packageJson = existsSync(packageJsonPath)
    ? JSON.parse(await readFile(packageJsonPath, 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    : {};
  const deps = { ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) };

  const hasPrettier = [
    '.prettierrc', '.prettierrc.json', '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.mjs',
    'prettier.config.js', 'prettier.config.cjs', 'prettier.config.mjs',
  ].some((name) => existsSync(join(cwd, name))) || 'prettier' in deps;
  if (hasPrettier) {
    return { command: 'npx', args: ['prettier', '--check', '.'], label: 'Prettier' };
  }

  const hasBiome = existsSync(join(cwd, 'biome.json')) || existsSync(join(cwd, 'biome.jsonc')) || '@biomejs/biome' in deps;
  if (hasBiome) {
    return { command: 'npx', args: ['biome', 'format', '.', '--write=false'], label: 'Biome format' };
  }

  return null;
}

export async function runFormat(cwd: string, options?: { env?: NodeJS.ProcessEnv }): Promise<VerificationRunCheckResult> {
  const tool = await detectFormatter(cwd);
  if (!tool) {
    return { status: 'skipped', output: 'No prettier or biome formatter configuration found.', durationMs: 0 };
  }

  const startedAt = Date.now();
  const result = await runSubprocess(tool.command, tool.args, { cwd, env: options?.env });
  const rawOutput = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();

  return {
    status: result.exitCode === 0 ? 'pass' : 'fail',
    output: rawOutput.length > 0 ? `${tool.label}:\n${rawOutput}` : `${tool.label} completed successfully.`,
    durationMs: Date.now() - startedAt,
  };
}
