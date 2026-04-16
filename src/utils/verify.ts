import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, normalize } from 'path';
import { execa } from 'execa';
import {
  parseFilesFromTaskMd,
  parseSectionFromTaskMd,
  parseDiffFilePaths,
  runGitDiff,
} from './git.js';
import type { VerificationCheck, VerificationResult } from '../config/schema.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function normPath(p: string): string {
  return normalize(p.replace(/^\.\//, ''));
}

function buildResult(
  phase: 'frame' | 'build' | 'critic',
  checks: VerificationCheck[]
): VerificationResult {
  const hasFail = checks.some((c) => c.status === 'fail');
  const hasWarn = checks.some((c) => c.status === 'warn');
  const verdict: 'pass' | 'warn' | 'fail' = hasFail ? 'fail' : hasWarn ? 'warn' : 'pass';
  return { phase, verdict, checks, timestamp: new Date().toISOString() };
}

// ── Individual checks ─────────────────────────────────────────────────────────

export async function checkTaskFile(taskMdPath: string): Promise<VerificationCheck[]> {
  if (!existsSync(taskMdPath)) {
    return [{ name: 'Task file', status: 'fail', message: `Not found: ${taskMdPath}` }];
  }

  const checks: VerificationCheck[] = [];
  checks.push({ name: 'Task file', status: 'pass', message: taskMdPath });

  const md = await readFile(taskMdPath, 'utf8');

  const goal = parseSectionFromTaskMd(md, 'Goal');
  checks.push(
    goal
      ? { name: 'Goal section', status: 'pass', message: 'non-empty' }
      : { name: 'Goal section', status: 'fail', message: '## Goal is empty or missing' }
  );

  const files = parseFilesFromTaskMd(md);
  checks.push(
    files.length > 0
      ? { name: 'Files section', status: 'pass', message: `${files.length} file(s) listed` }
      : { name: 'Files section', status: 'fail', message: '## Files has no entries' }
  );

  const doneCriteria = parseSectionFromTaskMd(md, 'Done Criteria');
  const criteriaCount = (doneCriteria.match(/^- \[[ xX]\]/gm) ?? []).length;
  checks.push(
    criteriaCount > 0
      ? { name: 'Done Criteria', status: 'pass', message: `${criteriaCount} item(s)` }
      : { name: 'Done Criteria', status: 'fail', message: '## Done Criteria has no checkbox items' }
  );

  const hasRisks = /^##\s+Risks\s*$/m.test(md);
  checks.push(
    hasRisks
      ? { name: 'Risks section', status: 'pass', message: 'present' }
      : { name: 'Risks section', status: 'fail', message: '## Risks section missing' }
  );

  const constraints = parseSectionFromTaskMd(md, 'Constraints');
  if (!constraints) {
    checks.push({
      name: 'Constraints section',
      status: 'warn',
      message: 'empty — consider documenting constraints',
    });
  }

  return checks;
}

/**
 * Check that files listed in the task's ## Files section actually exist in the repo.
 * Warns (not fails) — a file may not exist yet if it's being created.
 */
export function checkFilesExist(taskFiles: string[], cwd: string): VerificationCheck[] {
  if (taskFiles.length === 0) return [];
  return taskFiles.map((f) => {
    const exists = existsSync(join(cwd, normPath(f)));
    return exists
      ? { name: `File: ${f}`, status: 'pass' as const, message: 'exists in repo' }
      : { name: `File: ${f}`, status: 'warn' as const, message: 'not found — will be created, or path is wrong' };
  });
}

export async function checkGitScope(
  taskFiles: string[],
  base: string,
  cwd: string
): Promise<{ checks: VerificationCheck[]; diff: string }> {
  // Run unscoped diff to get ALL changed files
  const { diff } = await runGitDiff([], base, cwd);
  const changedFiles = parseDiffFilePaths(diff).map(normPath);
  const normalizedTaskFiles = taskFiles.map(normPath);

  if (changedFiles.length === 0 && normalizedTaskFiles.length === 0) {
    return {
      checks: [{ name: 'Git scope', status: 'warn', message: `No changes found vs ${base} and no files in task` }],
      diff,
    };
  }

  const checks: VerificationCheck[] = [];

  // Files in task — check if they were touched
  for (const tf of normalizedTaskFiles) {
    checks.push(
      changedFiles.includes(tf)
        ? { name: `Scope: ${tf}`, status: 'pass', message: 'in task file' }
        : { name: `Scope: ${tf}`, status: 'warn', message: 'expected change not found in diff' }
    );
  }

  // Changed files NOT in task — scope creep
  for (const cf of changedFiles) {
    if (!normalizedTaskFiles.includes(cf)) {
      checks.push({
        name: `Scope: ${cf}`,
        status: 'warn',
        message: 'not in task file — scope creep or update ## Files list',
      });
    }
  }

  if (changedFiles.length === 0) {
    checks.push({ name: 'Git scope', status: 'warn', message: `No changes found vs ${base}` });
  }

  return { checks, diff };
}

export async function checkTypeScript(cwd: string): Promise<VerificationCheck> {
  if (!existsSync(join(cwd, 'tsconfig.json'))) {
    return { name: 'TypeScript', status: 'pass', message: 'tsconfig.json not found — skipped' };
  }
  try {
    const result = await execa('npx', ['tsc', '--noEmit'], { cwd, reject: false });
    const output = [(result.stdout as string), (result.stderr as string)].join('\n').trim();
    const errorLines = output.split('\n').filter((l) => l.includes('error TS'));
    if (errorLines.length === 0) {
      return { name: 'TypeScript', status: 'pass', message: 'tsc --noEmit — 0 errors' };
    }
    const preview = errorLines.slice(0, 5).join('\n');
    return {
      name: 'TypeScript',
      status: 'fail',
      message: `tsc --noEmit — ${errorLines.length} error(s)\n${preview}`,
    };
  } catch {
    return { name: 'TypeScript', status: 'warn', message: 'tsc could not run (npx not available?)' };
  }
}

export async function checkTestSuite(cwd: string): Promise<VerificationCheck> {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) {
    return { name: 'Tests', status: 'warn', message: 'No package.json — skipped' };
  }
  let pkg: { scripts?: Record<string, string> };
  try {
    pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as { scripts?: Record<string, string> };
  } catch {
    return { name: 'Tests', status: 'warn', message: 'Could not parse package.json' };
  }

  const testScript = pkg.scripts?.['test'];
  if (!testScript) {
    return { name: 'Tests', status: 'warn', message: 'No test script in package.json — skipped' };
  }

  let cmd: string;
  let args: string[];
  if (testScript.includes('vitest')) {
    cmd = 'npx'; args = ['vitest', 'run'];
  } else if (testScript.includes('jest')) {
    cmd = 'npx'; args = ['jest', '--passWithNoTests'];
  } else if (testScript.includes('bun test')) {
    cmd = 'bun'; args = ['test'];
  } else {
    cmd = 'npm'; args = ['test'];
  }

  try {
    const result = await execa(cmd, args, { cwd, reject: false });
    const stdout = result.stdout as string;
    const passMatch = stdout.match(/(\d+)\s+pass(?:ed)?/i);
    const failMatch = stdout.match(/(\d+)\s+fail(?:ed)?/i);
    const summary =
      [
        passMatch ? `${passMatch[1]} passed` : null,
        failMatch ? `${failMatch[1]} failed` : null,
      ]
        .filter(Boolean)
        .join(', ') || (result.exitCode === 0 ? 'passed' : 'failed');

    if (result.exitCode === 0) {
      return { name: 'Tests', status: 'pass', message: `${cmd} ${args.join(' ')} — ${summary}` };
    }
    return { name: 'Tests', status: 'fail', message: `${cmd} ${args.join(' ')} — ${summary} (exit ${result.exitCode ?? 'unknown'})` };
  } catch (err) {
    return { name: 'Tests', status: 'fail', message: `Test runner error: ${String(err)}` };
  }
}

export function checkDoneCriteriaStatus(md: string): VerificationCheck {
  const section = parseSectionFromTaskMd(md, 'Done Criteria');
  const total = (section.match(/^- \[[ xX]\]/gm) ?? []).length;
  const checked = (section.match(/^- \[x\]/gim) ?? []).length;
  return {
    name: 'Done criteria status',
    status: checked > 0 ? 'pass' : 'warn',
    message: `${checked}/${total} marked done`,
  };
}

/**
 * Scan added lines in a git diff for TODO/FIXME/HACK/XXX markers.
 * Only counts lines that start with '+' (added), not context or removed lines.
 */
export function checkTodosInDiff(diff: string): VerificationCheck {
  // Lines starting with + but not ++ (diff headers)
  const addedLines = diff.split('\n').filter((l) => /^\+[^+]/.test(l));
  const todoLines = addedLines.filter((l) => /\b(TODO|FIXME|HACK|XXX)\b/i.test(l));
  if (todoLines.length === 0) {
    return { name: 'TODOs in diff', status: 'pass', message: 'none found' };
  }
  const samples = todoLines
    .slice(0, 3)
    .map((l) => l.replace(/^\+/, '').trim())
    .join(' | ');
  return {
    name: 'TODOs in diff',
    status: 'warn',
    message: `${todoLines.length} TODO/FIXME/HACK found — ${samples}`,
  };
}

/**
 * Run language-aware linters. Only runs linters for languages detected in the project.
 * All linters are optional: if the tool is not installed, returns a warn (not fail).
 */
export async function checkLinters(cwd: string): Promise<VerificationCheck[]> {
  const checks: VerificationCheck[] = [];

  // ── ESLint (JavaScript / TypeScript) ─────────────────────────────────────
  const eslintConfigs = [
    '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.mjs',
    '.eslintrc.yaml', '.eslintrc.yml',
    'eslint.config.js', 'eslint.config.ts', 'eslint.config.mjs', 'eslint.config.cjs',
  ];
  const hasEslintConfig = eslintConfigs.some((f) => existsSync(join(cwd, f)));

  // Also detect eslintConfig key in package.json
  let hasEslintInPkg = false;
  try {
    const pkgRaw = await readFile(join(cwd, 'package.json'), 'utf8');
    hasEslintInPkg = /"eslintConfig"\s*:/.test(pkgRaw);
  } catch { /* no package.json */ }

  if (hasEslintConfig || hasEslintInPkg) {
    checks.push(await runLinter('ESLint', 'npx', ['eslint', '--format=compact', '--quiet', '.'], cwd, parseEslintOutput));
  }

  // ── Ruff (Python) ─────────────────────────────────────────────────────────
  const hasRuffToml = existsSync(join(cwd, '.ruff.toml'));
  let hasPyprojectRuff = false;
  if (existsSync(join(cwd, 'pyproject.toml'))) {
    try {
      const content = await readFile(join(cwd, 'pyproject.toml'), 'utf8');
      hasPyprojectRuff = content.includes('[tool.ruff]');
    } catch { /* skip */ }
  }

  if (hasRuffToml || hasPyprojectRuff) {
    checks.push(await runLinter('Ruff', 'ruff', ['check', '.'], cwd, parseGenericOutput));
  }

  // ── go vet (Go) ───────────────────────────────────────────────────────────
  if (existsSync(join(cwd, 'go.mod'))) {
    checks.push(await runLinter('go vet', 'go', ['vet', './...'], cwd, parseGoVetOutput));
  }

  // ── cargo check (Rust) ───────────────────────────────────────────────────
  if (existsSync(join(cwd, 'Cargo.toml'))) {
    checks.push(await runLinter('cargo check', 'cargo', ['check'], cwd, parseCargoOutput));
  }

  // ── RuboCop (Ruby) ───────────────────────────────────────────────────────
  if (existsSync(join(cwd, '.rubocop.yml'))) {
    checks.push(await runLinter('RuboCop', 'rubocop', ['--format=quiet'], cwd, parseGenericOutput));
  }

  return checks;
}

// ── Linter runner + parsers ───────────────────────────────────────────────────

type OutputParser = (stdout: string, stderr: string, exitCode: number | null) => VerificationCheck;

async function runLinter(
  name: string,
  cmd: string,
  args: string[],
  cwd: string,
  parser: OutputParser
): Promise<VerificationCheck> {
  try {
    const result = await execa(cmd, args, { cwd, reject: false, timeout: 60_000 });
    const check = parser(result.stdout as string, result.stderr as string, result.exitCode ?? null);
    return { ...check, name }; // always use the canonical linter name
  } catch (err: unknown) {
    // ENOENT = tool not installed
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return { name, status: 'warn', message: `${cmd} not installed — skipped` };
    }
    return { name, status: 'warn', message: `${name} could not run: ${String(err)}` };
  }
}

function parseEslintOutput(stdout: string, _stderr: string, exitCode: number | null): VerificationCheck {
  // ESLint --format=compact: each problem on one line ending in "error" or "warning"
  const errorLines = stdout.split('\n').filter((l) => /\s+error\s+/i.test(l));
  if (exitCode === 0 || errorLines.length === 0) {
    return { name: 'ESLint', status: 'pass', message: '0 errors' };
  }
  return {
    name: 'ESLint',
    status: 'fail',
    message: `${errorLines.length} error(s) — ${errorLines[0]?.trim().slice(0, 100) ?? ''}`,
  };
}

function parseGoVetOutput(stdout: string, stderr: string, exitCode: number | null): VerificationCheck {
  const combined = [stdout, stderr].join('\n').trim();
  if (exitCode === 0) {
    return { name: 'go vet', status: 'pass', message: 'no issues' };
  }
  const firstLine = combined.split('\n')[0]?.trim() ?? 'errors found';
  return { name: 'go vet', status: 'fail', message: firstLine };
}

function parseCargoOutput(stdout: string, stderr: string, exitCode: number | null): VerificationCheck {
  const combined = [stdout, stderr].join('\n');
  const errorCount = (combined.match(/^error(?!\[E)/gm) ?? []).length;
  if (exitCode === 0 || errorCount === 0) {
    return { name: 'cargo check', status: 'pass', message: 'no errors' };
  }
  return { name: 'cargo check', status: 'fail', message: `${errorCount} error(s)` };
}

function parseGenericOutput(_stdout: string, _stderr: string, exitCode: number | null): VerificationCheck {
  // Used for Ruff and RuboCop: non-zero exit = violations found
  return exitCode === 0
    ? { name: 'Linter', status: 'pass', message: 'no issues' }
    : { name: 'Linter', status: 'fail', message: 'violations found' };
}

export function checkReviewNotes(reviewNotes: string | undefined): VerificationCheck[] {
  if (!reviewNotes?.trim()) {
    return [{ name: 'Review notes', status: 'fail', message: 'Review notes are empty or missing' }];
  }

  const checks: VerificationCheck[] = [];
  checks.push({ name: 'Review notes', status: 'pass', message: 'non-empty' });

  const hasBlockersHeading = /^##\s+Blockers/m.test(reviewNotes);
  if (!hasBlockersHeading) {
    checks.push({
      name: 'Blockers section',
      status: 'fail',
      message: '## Blockers section missing from review notes',
    });
    return checks;
  }
  checks.push({ name: 'Blockers section', status: 'pass', message: 'present' });

  // Check if blockers has content (a dash-prefixed list item with non-whitespace)
  const blockersBody = reviewNotes.split(/^##\s+Blockers/m)[1]?.split(/^##/m)[0] ?? '';
  const hasContent = /^-\s+\S/m.test(blockersBody);
  checks.push(
    hasContent
      ? { name: 'Blockers content', status: 'warn', message: 'Unresolved blockers present — resolve before sync' }
      : { name: 'Blockers content', status: 'pass', message: 'No blockers listed' }
  );

  return checks;
}

// ── Phase orchestrators ───────────────────────────────────────────────────────

export interface VerifyOptions {
  taskId: string;
  base?: string;
  cwd: string;
  docsDir: string;
}

export async function runVerifyFrame(opts: VerifyOptions): Promise<VerificationResult> {
  const taskMdPath = join(opts.docsDir, 'tasks', `${opts.taskId}.md`);
  const taskChecks = await checkTaskFile(taskMdPath);

  // Check that listed files exist in the repo
  let fileExistChecks: VerificationCheck[] = [];
  if (existsSync(taskMdPath)) {
    const md = await readFile(taskMdPath, 'utf8');
    const taskFiles = parseFilesFromTaskMd(md);
    fileExistChecks = checkFilesExist(taskFiles, opts.cwd);
  }

  return buildResult('frame', [...taskChecks, ...fileExistChecks]);
}

export async function runVerifyBuild(opts: VerifyOptions): Promise<VerificationResult> {
  const taskMdPath = join(opts.docsDir, 'tasks', `${opts.taskId}.md`);

  // Always run task file checks
  const taskChecks = await checkTaskFile(taskMdPath);

  let scopeChecks: VerificationCheck[] = [];
  let doneCriteriaCheck: VerificationCheck | null = null;
  let diffForTodos = '';

  if (existsSync(taskMdPath)) {
    const md = await readFile(taskMdPath, 'utf8');
    const taskFiles = parseFilesFromTaskMd(md);
    const scopeResult = await checkGitScope(taskFiles, opts.base ?? 'HEAD', opts.cwd);
    scopeChecks = scopeResult.checks;
    diffForTodos = scopeResult.diff;
    doneCriteriaCheck = checkDoneCriteriaStatus(md);
  }

  const tsCheck = await checkTypeScript(opts.cwd);
  const testCheck = await checkTestSuite(opts.cwd);
  const linterChecks = await checkLinters(opts.cwd);
  const todosCheck = checkTodosInDiff(diffForTodos);

  const checks = [
    ...taskChecks,
    ...scopeChecks,
    tsCheck,
    testCheck,
    ...linterChecks,
    todosCheck,
    ...(doneCriteriaCheck ? [doneCriteriaCheck] : []),
  ];

  return buildResult('build', checks);
}

export async function runVerifyCritic(
  opts: VerifyOptions,
  reviewNotes: string | undefined
): Promise<VerificationResult> {
  const checks = checkReviewNotes(reviewNotes);
  return buildResult('critic', checks);
}

// ── Formatting ─────────────────────────────────────────────────────────────────

export function formatVerificationResult(result: VerificationResult): string {
  const icon = (status: 'pass' | 'warn' | 'fail') =>
    status === 'pass' ? '✓' : status === 'warn' ? '⚠' : '✗';

  const lines: string[] = [];
  for (const check of result.checks) {
    lines.push(`${icon(check.status)} ${check.name} — ${check.message}`);
  }

  const verdictLabel =
    result.verdict === 'pass'
      ? 'PASS'
      : result.verdict === 'warn'
        ? 'PASS WITH WARNINGS'
        : 'FAIL';

  lines.push('');
  lines.push(`Verdict: ${verdictLabel}`);

  const issues = result.checks.filter((c) => c.status !== 'pass');
  for (const issue of issues) {
    lines.push(`  ${icon(issue.status)} ${issue.message}`);
  }

  return lines.join('\n');
}
