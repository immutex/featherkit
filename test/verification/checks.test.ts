import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

import { runBuild } from '../../src/verification/checks/build.js';
import { runDepsDrift } from '../../src/verification/checks/deps-drift.js';
import { runFormat } from '../../src/verification/checks/format.js';
import { runGitClean } from '../../src/verification/checks/git-clean.js';
import { runLint } from '../../src/verification/checks/lint.js';
import { runTests } from '../../src/verification/checks/test.js';
import { runTypecheck } from '../../src/verification/checks/typecheck.js';
import { runChecks } from '../../src/verification/runner.js';

const tmpDirs: string[] = [];
const originalPath = process.env.PATH ?? '';
const realGitPath = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
const realGitDir = dirname(realGitPath);

async function makeTempProject(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'featherkit-verification-'));
  tmpDirs.push(cwd);
  return cwd;
}

async function writeExecutable(filePath: string, body: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, body, 'utf8');
  await chmod(filePath, 0o755);
}

async function makeBinEnv(cwd: string, files: Record<string, string>): Promise<NodeJS.ProcessEnv> {
  const binDir = join(cwd, 'bin');
  await mkdir(binDir, { recursive: true });

  await Promise.all(
    Object.entries(files).map(([name, body]) => writeExecutable(join(binDir, name), body)),
  );

  return {
    ...process.env,
    PATH: `${binDir}:${originalPath}`,
  };
}

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('verification checks', () => {
  it('runChecks returns pass results for typecheck and test when both checks succeed', async () => {
    const cwd = await makeTempProject();
    await writeFile(join(cwd, 'package.json'), JSON.stringify({
      name: 'run-checks-pass',
      scripts: { test: 'node -e "process.exit(0)"' },
    }, null, 2), 'utf8');
    await mkdir(join(cwd, 'node_modules', '.bin'), { recursive: true });
    const env = { ...process.env, PATH: originalPath };
    await writeFile(join(cwd, 'tsconfig.json'), JSON.stringify({ compilerOptions: { noEmit: true } }, null, 2), 'utf8');
    await writeExecutable(
      join(cwd, 'node_modules', '.bin', 'tsc'),
      `#!/usr/bin/env bash
exit 0
`,
    );

    const results = await runChecks(['typecheck', 'test'], cwd, { env });

    expect(results.typecheck?.status).toBe('pass');
    expect(results.test?.status).toBe('pass');
  });

  it('runLint and runFormat skip when no tool configuration is present', async () => {
    const cwd = await makeTempProject();
    await writeFile(join(cwd, 'package.json'), JSON.stringify({ name: 'skip-tools', scripts: {} }, null, 2), 'utf8');

    await expect(runLint(cwd)).resolves.toMatchObject({ status: 'skipped' });
    await expect(runFormat(cwd)).resolves.toMatchObject({ status: 'skipped' });
  });

  it('runTypecheck fails on a deliberate TypeScript error', async () => {
    const cwd = await makeTempProject();
    await writeFile(join(cwd, 'tsconfig.json'), JSON.stringify({ compilerOptions: { noEmit: true, strict: true }, include: ['broken.ts'] }, null, 2), 'utf8');
    await writeFile(join(cwd, 'broken.ts'), 'const broken: string = 123;\n', 'utf8');
    await mkdir(join(cwd, 'node_modules', '.bin'), { recursive: true });
    await writeExecutable(
      join(cwd, 'node_modules', '.bin', 'tsc'),
      `#!/usr/bin/env bash
printf 'broken.ts(1,7): error TS2322: Type \'number\' is not assignable to type \'string\'.\n' >&2
exit 1
`,
    );

    const result = await runTypecheck(cwd, { env: { ...process.env, PATH: originalPath } });

    expect(result.status).toBe('fail');
    expect(result.output).toContain('error TS');
  });

  it('runTests and runBuild use bun when a bun lockfile is present', async () => {
    const cwd = await makeTempProject();
    await writeFile(join(cwd, 'package.json'), JSON.stringify({
      name: 'bun-checks',
      scripts: { test: 'bun test', build: 'bun run build' },
    }, null, 2), 'utf8');
    await writeFile(join(cwd, 'bun.lock'), '# bun lock\n', 'utf8');
    const env = await makeBinEnv(cwd, {
      bun: `#!/usr/bin/env bash
if [ "$1" = "test" ]; then
  exit 0
fi
if [ "$1" = "run" ] && [ "$2" = "build" ]; then
  exit 0
fi
if [ "$1" = "install" ]; then
  exit 0
fi
exit 1
`,
    });

    await expect(runTests(cwd, { env })).resolves.toMatchObject({ status: 'pass' });
    await expect(runBuild(cwd, { env })).resolves.toMatchObject({ status: 'pass' });
  });

  it('runDepsDrift skips when no bun lockfile is present', async () => {
    const cwd = await makeTempProject();
    await writeFile(join(cwd, 'package.json'), JSON.stringify({ name: 'deps-drift' }, null, 2), 'utf8');

    await expect(runDepsDrift(cwd)).resolves.toMatchObject({ status: 'skipped' });
  });

  it('runGitClean passes for task-scoped changes and fails for unexpected files', async () => {
    const cwd = await makeTempProject();
    const gitEnv = { ...process.env, PATH: `${realGitDir}:/usr/bin:/bin` };
    execFileSync(realGitPath, ['init'], { cwd, env: gitEnv });
    execFileSync(realGitPath, ['config', 'user.email', 'test@example.com'], { cwd, env: gitEnv });
    execFileSync(realGitPath, ['config', 'user.name', 'Test User'], { cwd, env: gitEnv });

    await writeFile(join(cwd, 'allowed.ts'), 'export const allowed = true;\n', 'utf8');
    await writeFile(join(cwd, 'unexpected.ts'), 'export const unexpected = true;\n', 'utf8');
    execFileSync(realGitPath, ['add', '.'], { cwd, env: gitEnv });
    execFileSync(realGitPath, ['commit', '-m', 'init'], { cwd, env: gitEnv });

    await writeFile(join(cwd, 'allowed.ts'), 'export const allowed = false;\n', 'utf8');
    const passResult = await runGitClean(cwd, { taskFiles: ['allowed.ts'], env: gitEnv });
    expect(passResult.status).toBe('pass');

    await writeFile(join(cwd, 'unexpected.ts'), 'export const unexpected = false;\n', 'utf8');
    const failResult = await runGitClean(cwd, { taskFiles: ['allowed.ts'], env: gitEnv });
    expect(failResult.status).toBe('fail');
    expect(failResult.output).toContain('unexpected.ts');
  });
});
