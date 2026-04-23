import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { VerificationRunCheckResult } from '../config/schema.js';
import { parseFilesFromTaskMd } from '../utils/git.js';
import { AVAILABLE_CHECKS, type VerificationCheckName } from './index.js';

export type VerificationRunOptions = {
  taskFiles?: string[];
  env?: NodeJS.ProcessEnv;
};

export function parseTaskFiles(markdown: string): string[] {
  return parseFilesFromTaskMd(markdown)
    .map((line) => line.match(/`([^`]+)`/)?.[1] ?? line)
    .map((line) => line.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean);
}

export async function resolveTaskFiles(cwd: string, docsDir: string, taskId: string): Promise<string[]> {
  const taskFilePath = join(docsDir, 'tasks', `${taskId}.md`);
  if (!existsSync(taskFilePath)) {
    return [];
  }

  const markdown = await readFile(taskFilePath, 'utf8');
  return parseTaskFiles(markdown);
}

export async function runChecks(
  names: string[],
  cwd: string,
  options: VerificationRunOptions = {},
): Promise<Record<string, VerificationRunCheckResult>> {
  const uniqueNames = [...new Set(names)];
  const entries = await Promise.all(uniqueNames.map(async (name) => {
    const runner = AVAILABLE_CHECKS[name as VerificationCheckName];
    if (!runner) {
      return [name, { status: 'fail', output: `Unknown verification check: ${name}`, durationMs: 0 } satisfies VerificationRunCheckResult] as const;
    }

    const result = await runner(cwd, options);
    return [name, result] as const;
  }));

  return Object.fromEntries(entries);
}
