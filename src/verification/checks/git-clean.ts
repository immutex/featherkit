import type { VerificationRunCheckResult } from '../../config/schema.js';
import { runSubprocess } from '../subprocess.js';

export async function runGitClean(cwd: string, options?: { taskFiles?: string[]; env?: NodeJS.ProcessEnv }): Promise<VerificationRunCheckResult> {
  const startedAt = Date.now();
  const result = await runSubprocess('git', ['status', '--porcelain'], { cwd, env: options?.env });
  const output = result.stdout.trim();

  if (result.exitCode !== 0) {
    return {
      status: 'fail',
      output: [result.stdout, result.stderr].filter(Boolean).join('\n').trim() || 'git status failed.',
      durationMs: Date.now() - startedAt,
    };
  }

  if (output.length === 0) {
    return { status: 'pass', output: 'Working tree is clean.', durationMs: Date.now() - startedAt };
  }

  const changedFiles = output
    .split('\n')
    .map((line) => {
      const trimmed = line.trimEnd();
      return trimmed.match(/^[ MADRCU?!]{2}\s+(.*)$/)?.[1]?.trim()
        ?? trimmed.match(/^[MADRCU?!]\s+(.*)$/)?.[1]?.trim()
        ?? trimmed;
    })
    .filter(Boolean);

  const allowed = new Set((options?.taskFiles ?? []).map((file) => file.replace(/^\.\//, '')));
  if (allowed.size === 0) {
    return {
      status: 'fail',
      output: `Uncommitted changes detected:\n${changedFiles.join('\n')}`,
      durationMs: Date.now() - startedAt,
    };
  }

  const unexpected = changedFiles.filter((file) => !allowed.has(file));
  return {
    status: unexpected.length === 0 ? 'pass' : 'fail',
    output:
      unexpected.length === 0
        ? `Changes are limited to task files:\n${changedFiles.join('\n')}`
        : `Unexpected changes outside task files:\n${unexpected.join('\n')}`,
    durationMs: Date.now() - startedAt,
  };
}
