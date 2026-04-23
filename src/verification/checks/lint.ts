import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { VerificationRunCheckResult } from '../../config/schema.js';
import { runSubprocess } from '../subprocess.js';

async function detectLintTool(cwd: string): Promise<{ command: string; args: string[]; label: string } | null> {
  const packageJsonPath = join(cwd, 'package.json');
  const packageJson = existsSync(packageJsonPath)
    ? JSON.parse(await readFile(packageJsonPath, 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    : {};
  const deps = { ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) };

  const hasBiome = existsSync(join(cwd, 'biome.json')) || existsSync(join(cwd, 'biome.jsonc')) || '@biomejs/biome' in deps;
  if (hasBiome) {
    return { command: 'npx', args: ['biome', 'check', '.'], label: 'Biome' };
  }

  const eslintConfigs = [
    '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.mjs', '.eslintrc.yaml', '.eslintrc.yml',
    'eslint.config.js', 'eslint.config.cjs', 'eslint.config.mjs', 'eslint.config.ts',
  ];
  const hasEslint = eslintConfigs.some((name) => existsSync(join(cwd, name))) || 'eslint' in deps;
  if (hasEslint) {
    return { command: 'npx', args: ['eslint', '.'], label: 'ESLint' };
  }

  return null;
}

export async function runLint(cwd: string, options?: { env?: NodeJS.ProcessEnv }): Promise<VerificationRunCheckResult> {
  const tool = await detectLintTool(cwd);
  if (!tool) {
    return { status: 'skipped', output: 'No eslint or biome configuration found.', durationMs: 0 };
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
