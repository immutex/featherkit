import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import {
  checkTaskFile,
  checkDoneCriteriaStatus,
  checkReviewNotes,
  checkTypeScript,
  checkTestSuite,
  checkGitScope,
  formatVerificationResult,
  runVerifyFrame,
  runVerifyCritic,
} from '../src/utils/verify.js';
import type { VerificationResult } from '../src/config/schema.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(async () => {
  tmpDir = join(tmpdir(), `fa-verify-${randomBytes(6).toString('hex')}`);
  await mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

const FULL_TASK_MD = `# Task: FEAT-001

## Goal
Implement the feature.

## Files
src/feature.ts
src/feature.test.ts

## Constraints
Must not break existing tests.

## Risks
Could affect performance.

## Done Criteria
- [ ] Feature implemented
- [ ] Tests pass
- [x] Spec reviewed
`;

// ── checkTaskFile ─────────────────────────────────────────────────────────────

describe('checkTaskFile', () => {
  it('returns single fail check when file does not exist', async () => {
    const checks = await checkTaskFile(join(tmpDir, 'nonexistent.md'));
    expect(checks).toHaveLength(1);
    expect(checks[0]!.status).toBe('fail');
    expect(checks[0]!.message).toContain('Not found');
  });

  it('returns pass for Task file check when file exists', async () => {
    const path = join(tmpDir, 'task.md');
    await writeFile(path, FULL_TASK_MD, 'utf8');
    const checks = await checkTaskFile(path);
    const taskFileCheck = checks.find((c) => c.name === 'Task file');
    expect(taskFileCheck?.status).toBe('pass');
  });

  it('fails Goal check when ## Goal section is empty', async () => {
    const md = '## Goal\n\n## Files\nsrc/a.ts\n\n## Done Criteria\n- [ ] done\n\n## Risks\nNone.\n';
    const path = join(tmpDir, 'task.md');
    await writeFile(path, md, 'utf8');
    const checks = await checkTaskFile(path);
    const goalCheck = checks.find((c) => c.name === 'Goal section');
    expect(goalCheck?.status).toBe('fail');
  });

  it('fails Files check when ## Files section is empty', async () => {
    const md = '## Goal\nDo something.\n\n## Files\n\n## Done Criteria\n- [ ] done\n\n## Risks\nNone.\n';
    const path = join(tmpDir, 'task.md');
    await writeFile(path, md, 'utf8');
    const checks = await checkTaskFile(path);
    const filesCheck = checks.find((c) => c.name === 'Files section');
    expect(filesCheck?.status).toBe('fail');
  });

  it('fails Done Criteria check when no checkbox items exist', async () => {
    const md = '## Goal\nDo it.\n\n## Files\nsrc/a.ts\n\n## Done Criteria\n(none)\n\n## Risks\nNone.\n';
    const path = join(tmpDir, 'task.md');
    await writeFile(path, md, 'utf8');
    const checks = await checkTaskFile(path);
    const criteriaCheck = checks.find((c) => c.name === 'Done Criteria');
    expect(criteriaCheck?.status).toBe('fail');
  });

  it('fails Risks check when ## Risks section is missing', async () => {
    const md = '## Goal\nDo it.\n\n## Files\nsrc/a.ts\n\n## Done Criteria\n- [ ] done\n';
    const path = join(tmpDir, 'task.md');
    await writeFile(path, md, 'utf8');
    const checks = await checkTaskFile(path);
    const risksCheck = checks.find((c) => c.name === 'Risks section');
    expect(risksCheck?.status).toBe('fail');
  });

  it('warns when ## Constraints section is empty', async () => {
    const md = '## Goal\nDo it.\n\n## Files\nsrc/a.ts\n\n## Constraints\n\n## Risks\nPresent.\n\n## Done Criteria\n- [ ] done\n';
    const path = join(tmpDir, 'task.md');
    await writeFile(path, md, 'utf8');
    const checks = await checkTaskFile(path);
    const constraintsCheck = checks.find((c) => c.name === 'Constraints section');
    expect(constraintsCheck?.status).toBe('warn');
  });

  it('returns all pass checks for a complete task file', async () => {
    const path = join(tmpDir, 'task.md');
    await writeFile(path, FULL_TASK_MD, 'utf8');
    const checks = await checkTaskFile(path);
    const fails = checks.filter((c) => c.status === 'fail');
    expect(fails).toHaveLength(0);
  });

  it('includes file count in Files section pass message', async () => {
    const path = join(tmpDir, 'task.md');
    await writeFile(path, FULL_TASK_MD, 'utf8');
    const checks = await checkTaskFile(path);
    const filesCheck = checks.find((c) => c.name === 'Files section');
    expect(filesCheck?.message).toContain('2');
  });
});

// ── checkDoneCriteriaStatus ───────────────────────────────────────────────────

describe('checkDoneCriteriaStatus', () => {
  it('warns when no items are checked', () => {
    const md = '## Done Criteria\n- [ ] First\n- [ ] Second\n';
    const check = checkDoneCriteriaStatus(md);
    expect(check.status).toBe('warn');
    expect(check.message).toBe('0/2 marked done');
  });

  it('passes when at least one item is checked', () => {
    const md = '## Done Criteria\n- [x] First\n- [ ] Second\n';
    const check = checkDoneCriteriaStatus(md);
    expect(check.status).toBe('pass');
    expect(check.message).toBe('1/2 marked done');
  });

  it('reports all items done', () => {
    const md = '## Done Criteria\n- [x] First\n- [x] Second\n';
    const check = checkDoneCriteriaStatus(md);
    expect(check.status).toBe('pass');
    expect(check.message).toBe('2/2 marked done');
  });

  it('counts [X] (uppercase) as checked', () => {
    const md = '## Done Criteria\n- [X] First\n- [ ] Second\n';
    const check = checkDoneCriteriaStatus(md);
    expect(check.status).toBe('pass');
  });

  it('handles empty done criteria section', () => {
    const md = '## Done Criteria\n\n## Next\n';
    const check = checkDoneCriteriaStatus(md);
    expect(check.status).toBe('warn');
    expect(check.message).toBe('0/0 marked done');
  });
});

// ── checkReviewNotes ──────────────────────────────────────────────────────────

describe('checkReviewNotes', () => {
  it('fails when review notes are undefined', () => {
    const checks = checkReviewNotes(undefined);
    expect(checks[0]!.status).toBe('fail');
    expect(checks[0]!.message).toContain('empty or missing');
  });

  it('fails when review notes are an empty string', () => {
    const checks = checkReviewNotes('');
    expect(checks[0]!.status).toBe('fail');
  });

  it('fails when review notes are whitespace only', () => {
    const checks = checkReviewNotes('   \n  ');
    expect(checks[0]!.status).toBe('fail');
  });

  it('fails when ## Blockers heading is missing', () => {
    const notes = 'LGTM, looks good overall.';
    const checks = checkReviewNotes(notes);
    const blockersCheck = checks.find((c) => c.name === 'Blockers section');
    expect(blockersCheck?.status).toBe('fail');
  });

  it('passes when ## Blockers heading exists with no content', () => {
    const notes = '## Blockers (must fix before merge)\n\n## Suggestions\n- Minor thing\n\n## Approved criteria\n- [x] done\n';
    const checks = checkReviewNotes(notes);
    const blockersContent = checks.find((c) => c.name === 'Blockers content');
    expect(blockersContent?.status).toBe('pass');
  });

  it('warns when ## Blockers section has content (unresolved blockers)', () => {
    const notes = '## Blockers (must fix before merge)\n- src/foo.ts:42 — missing null check\n\n## Suggestions\n';
    const checks = checkReviewNotes(notes);
    const blockersContent = checks.find((c) => c.name === 'Blockers content');
    expect(blockersContent?.status).toBe('warn');
    expect(blockersContent?.message).toContain('Unresolved blockers');
  });

  it('passes Review notes check for non-empty notes', () => {
    const notes = '## Blockers\n\n## Suggestions\n- minor\n';
    const checks = checkReviewNotes(notes);
    const reviewCheck = checks.find((c) => c.name === 'Review notes');
    expect(reviewCheck?.status).toBe('pass');
  });
});

// ── checkTypeScript ───────────────────────────────────────────────────────────

describe('checkTypeScript', () => {
  it('skips gracefully when tsconfig.json does not exist', async () => {
    const check = await checkTypeScript(tmpDir);
    expect(check.status).toBe('pass');
    expect(check.message).toContain('skipped');
  });
});

// ── checkTestSuite ────────────────────────────────────────────────────────────

describe('checkTestSuite', () => {
  it('skips when package.json does not exist', async () => {
    const check = await checkTestSuite(tmpDir);
    expect(check.status).toBe('warn');
    expect(check.message).toContain('skipped');
  });

  it('skips when package.json has no test script', async () => {
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }), 'utf8');
    const check = await checkTestSuite(tmpDir);
    expect(check.status).toBe('warn');
    expect(check.message).toContain('skipped');
  });

  it('warns when package.json cannot be parsed', async () => {
    await writeFile(join(tmpDir, 'package.json'), 'not json', 'utf8');
    const check = await checkTestSuite(tmpDir);
    expect(check.status).toBe('warn');
  });
});

// ── checkGitScope ─────────────────────────────────────────────────────────────

describe('checkGitScope', () => {
  it('warns when no changes and no task files', async () => {
    // Non-git directory — runGitDiff returns empty/error, parseDiffFilePaths returns []
    const checks = await checkGitScope([], 'HEAD', tmpDir);
    expect(checks).toHaveLength(1);
    expect(checks[0]!.status).toBe('warn');
  });

  it('warns for each expected file not found in diff', async () => {
    // Non-git dir → empty diff → task files not found
    const checks = await checkGitScope(['src/a.ts', 'src/b.ts'], 'HEAD', tmpDir);
    const notFoundChecks = checks.filter((c) => c.message.includes('expected change not found'));
    expect(notFoundChecks.length).toBeGreaterThanOrEqual(2);
  });
});

// ── formatVerificationResult ──────────────────────────────────────────────────

describe('formatVerificationResult', () => {
  function makeResult(
    phase: 'frame' | 'build' | 'critic',
    checks: Array<{ name: string; status: 'pass' | 'warn' | 'fail'; message: string }>
  ): VerificationResult {
    const hasFail = checks.some((c) => c.status === 'fail');
    const hasWarn = checks.some((c) => c.status === 'warn');
    const verdict: 'pass' | 'warn' | 'fail' = hasFail ? 'fail' : hasWarn ? 'warn' : 'pass';
    return { phase, verdict, checks, timestamp: new Date().toISOString() };
  }

  it('outputs "PASS" for all-passing result', () => {
    const result = makeResult('frame', [
      { name: 'Task file', status: 'pass', message: 'exists' },
      { name: 'Goal section', status: 'pass', message: 'non-empty' },
    ]);
    const text = formatVerificationResult(result);
    expect(text).toContain('PASS');
    expect(text).not.toContain('FAIL');
    expect(text).not.toContain('WARNINGS');
  });

  it('outputs "FAIL" for result with any fail', () => {
    const result = makeResult('build', [
      { name: 'Task file', status: 'fail', message: 'Not found' },
    ]);
    const text = formatVerificationResult(result);
    expect(text).toContain('FAIL');
  });

  it('outputs "PASS WITH WARNINGS" for warn-only result', () => {
    const result = makeResult('build', [
      { name: 'Scope', status: 'warn', message: 'scope creep' },
    ]);
    const text = formatVerificationResult(result);
    expect(text).toContain('PASS WITH WARNINGS');
  });

  it('uses ✓ for pass, ⚠ for warn, ✗ for fail', () => {
    const result = makeResult('critic', [
      { name: 'A', status: 'pass', message: 'ok' },
      { name: 'B', status: 'warn', message: 'warning' },
      { name: 'C', status: 'fail', message: 'error' },
    ]);
    const text = formatVerificationResult(result);
    expect(text).toContain('✓');
    expect(text).toContain('⚠');
    expect(text).toContain('✗');
  });

  it('lists issues in the verdict footer', () => {
    const result = makeResult('build', [
      { name: 'TypeScript', status: 'fail', message: '3 errors' },
      { name: 'Tests', status: 'pass', message: '10 passed' },
    ]);
    const text = formatVerificationResult(result);
    // Fail issue appears both inline and in the footer
    expect(text.split('3 errors').length).toBeGreaterThan(1);
  });
});

// ── runVerifyFrame ────────────────────────────────────────────────────────────

describe('runVerifyFrame', () => {
  it('fails when task file does not exist', async () => {
    const result = await runVerifyFrame({
      taskId: 'MISSING-001',
      cwd: tmpDir,
      docsDir: tmpDir,
    });
    expect(result.verdict).toBe('fail');
    expect(result.phase).toBe('frame');
  });

  it('passes for a complete task file', async () => {
    const tasksDir = join(tmpDir, 'tasks');
    await mkdir(tasksDir, { recursive: true });
    await writeFile(join(tasksDir, 'FEAT-001.md'), FULL_TASK_MD, 'utf8');

    const result = await runVerifyFrame({
      taskId: 'FEAT-001',
      cwd: tmpDir,
      docsDir: tmpDir,
    });
    expect(result.phase).toBe('frame');
    // Full task has Constraints filled — should be pass or warn only
    expect(result.verdict).not.toBe('fail');
  });

  it('warns (not fails) for missing Constraints section', async () => {
    const noConstraints = FULL_TASK_MD.replace('## Constraints\nMust not break existing tests.\n\n', '');
    const tasksDir = join(tmpDir, 'tasks');
    await mkdir(tasksDir, { recursive: true });
    await writeFile(join(tasksDir, 'FEAT-002.md'), noConstraints, 'utf8');

    const result = await runVerifyFrame({
      taskId: 'FEAT-002',
      cwd: tmpDir,
      docsDir: tmpDir,
    });
    // Missing constraints is a warn, not fail
    expect(result.verdict).toBe('warn');
    const constraintsCheck = result.checks.find((c) => c.name === 'Constraints section');
    expect(constraintsCheck?.status).toBe('warn');
  });
});

// ── runVerifyCritic ───────────────────────────────────────────────────────────

describe('runVerifyCritic', () => {
  const opts = { taskId: 'FEAT-001', cwd: '/tmp', docsDir: '/tmp' };

  it('fails when review notes are absent', async () => {
    const result = await runVerifyCritic(opts, undefined);
    expect(result.verdict).toBe('fail');
    expect(result.phase).toBe('critic');
  });

  it('fails when review notes lack ## Blockers heading', async () => {
    const result = await runVerifyCritic(opts, 'LGTM, all looks good.');
    expect(result.verdict).toBe('fail');
  });

  it('passes when review notes have ## Blockers with no content', async () => {
    const notes = '## Blockers (must fix before merge)\n\n## Approved criteria\n- [x] done\n';
    const result = await runVerifyCritic(opts, notes);
    expect(result.verdict).toBe('pass');
  });

  it('warns when ## Blockers has content (unresolved)', async () => {
    const notes = '## Blockers (must fix before merge)\n- src/a.ts — missing check\n\n## Suggestions\n';
    const result = await runVerifyCritic(opts, notes);
    expect(result.verdict).toBe('warn');
  });

  it('stores timestamp in ISO format', async () => {
    const notes = '## Blockers\n\n## Suggestions\n';
    const result = await runVerifyCritic(opts, notes);
    expect(() => new Date(result.timestamp)).not.toThrow();
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
