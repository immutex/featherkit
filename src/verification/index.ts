import type { VerificationRunCheckResult } from '../config/schema.js';
import { runBuild } from './checks/build.js';
import { runDepsDrift } from './checks/deps-drift.js';
import { runFormat } from './checks/format.js';
import { runGitClean } from './checks/git-clean.js';
import { runLint } from './checks/lint.js';
import { runTests } from './checks/test.js';
import { runTypecheck } from './checks/typecheck.js';

export type VerificationCheckRunner = (
  cwd: string,
  options?: { taskFiles?: string[]; env?: NodeJS.ProcessEnv },
) => Promise<VerificationRunCheckResult>;

export const AVAILABLE_CHECKS = {
  typecheck: runTypecheck,
  test: runTests,
  lint: runLint,
  format: runFormat,
  build: runBuild,
  'git-clean': runGitClean,
  'deps-drift': runDepsDrift,
} satisfies Record<string, VerificationCheckRunner>;

export type VerificationCheckName = keyof typeof AVAILABLE_CHECKS;

export {
  runBuild,
  runDepsDrift,
  runFormat,
  runGitClean,
  runLint,
  runTests,
  runTypecheck,
};
