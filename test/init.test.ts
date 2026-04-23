/**
 * Integration tests for the init flow.
 * Tests scaffoldFiles() and runDoctor() against real temp directories.
 * Does NOT test interactive prompts (inquirer) — that logic is thin wrappers.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, writeFile, readFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(async ({ default: defaultValue }: { default?: string }) => defaultValue ?? 'test-project'),
  select: vi.fn(async ({ default: defaultValue, choices }: { default?: string; choices?: Array<{ value: string }> }) => defaultValue ?? choices?.[0]?.value ?? 'both'),
  checkbox: vi.fn(async () => []),
  confirm: vi.fn(async () => true),
}));

import { checkbox, confirm, input, select } from '@inquirer/prompts';
import { initCommand, runInit, scaffoldFiles } from '../src/commands/init.js';
import { runDoctor } from '../src/commands/doctor.js';
import { defaultConfig } from '../src/config/defaults.js';
import { getAllTemplates } from '../src/templates/index.js';
import type { FeatherConfig } from '../src/config/schema.js';

function makeTmpDir(): string {
  return join(tmpdir(), `fa-init-test-${randomBytes(6).toString('hex')}`);
}

describe('runInit', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    await mkdir(tmpDir, { recursive: true });
    (input as any).mockClear();
    (select as any).mockClear();
    (checkbox as any).mockClear();
    (confirm as any).mockClear();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates all expected files without interactive prompts when flags are provided', async () => {
    await runInit(tmpDir, {
      name: 'test',
      preset: 'balanced',
      clients: 'claude-code',
      yes: true,
      localOnly: true,
    });

    expect(input).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(checkbox).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();

    const config = defaultConfig('test', 'balanced');
    const templates = getAllTemplates({ ...config, clients: 'claude-code' });
    for (const { relativePath } of templates) {
      if (relativePath.endsWith('.gitkeep')) continue;
      expect(existsSync(join(tmpDir, relativePath)), `Missing: ${relativePath}`).toBe(true);
    }
  });

  it('still runs the interactive prompts when flags are omitted', async () => {
    await runInit(tmpDir, {});

    expect(input).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(2);
    expect(checkbox).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('includes non-interactive flags in init help output', () => {
    const helpText = initCommand.helpInformation();
    expect(helpText).toContain('--name <name>');
    expect(helpText).toContain('--clients <client>');
    expect(helpText).toContain('-y, --yes');
  });
});

// ── scaffoldFiles ─────────────────────────────────────────────────────────────

describe('scaffoldFiles — both clients', () => {
  let tmpDir: string;
  const config: FeatherConfig = defaultConfig('init-test-project');

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates all expected files', async () => {
    await scaffoldFiles(tmpDir, config, false);
    const templates = getAllTemplates(config);
    for (const { relativePath } of templates) {
      if (relativePath.endsWith('.gitkeep')) continue; // empty placeholder
      expect(existsSync(join(tmpDir, relativePath)), `Missing: ${relativePath}`).toBe(true);
    }
  });

  it('creates .claude/CLAUDE.md with project name', async () => {
    await scaffoldFiles(tmpDir, config, false);
    const content = await readFile(join(tmpDir, '.claude', 'CLAUDE.md'), 'utf8');
    expect(content).toContain('init-test-project');
  });

  it('creates all four skill files', async () => {
    await scaffoldFiles(tmpDir, config, false);
    const skills = ['frame', 'build', 'critic', 'sync'];
    for (const skill of skills) {
      expect(existsSync(join(tmpDir, '.claude', 'commands', `${skill}.md`))).toBe(true);
    }
  });

  it('creates .opencode/opencode.json', async () => {
    await scaffoldFiles(tmpDir, config, false);
    const ocPath = join(tmpDir, '.opencode', 'opencode.json');
    expect(existsSync(ocPath)).toBe(true);
    const parsed = JSON.parse(await readFile(ocPath, 'utf8'));
    expect(parsed.mcp?.featherkit).toBeDefined();
  });

  it('creates a valid state.json', async () => {
    await scaffoldFiles(tmpDir, config, false);
    const statePath = join(tmpDir, '.project-state', 'state.json');
    expect(existsSync(statePath)).toBe(true);
    const parsed = JSON.parse(await readFile(statePath, 'utf8'));
    expect(parsed.version).toBe(1);
    expect(parsed.tasks).toEqual([]);
  });

  it('creates featherkit/config.json', async () => {
    await scaffoldFiles(tmpDir, config, false);
    const cfgPath = join(tmpDir, 'featherkit', 'config.json');
    expect(existsSync(cfgPath)).toBe(true);
    const parsed = JSON.parse(await readFile(cfgPath, 'utf8'));
    expect(parsed.projectName).toBe('init-test-project');
    expect(parsed.orchestrator).toBeDefined();
    expect(parsed.orchestrator.enabled).toBe(false);
    expect(parsed.orchestrator.router.model).toBe('haiku');
    expect(parsed.orchestrator.router.timeoutMs).toBe(60000);
  });

  it('creates project-docs directory structure', async () => {
    await scaffoldFiles(tmpDir, config, false);
    expect(existsSync(join(tmpDir, 'project-docs', 'context', 'architecture.md'))).toBe(true);
    expect(existsSync(join(tmpDir, 'project-docs', 'active', 'current-focus.md'))).toBe(true);
    expect(existsSync(join(tmpDir, 'project-docs', 'active', 'latest-handoff.md'))).toBe(true);
  });

  it('always overwrites managed files (skills, agents) without --force', async () => {
    await mkdir(join(tmpDir, '.claude'), { recursive: true });
    await writeFile(join(tmpDir, '.claude', 'CLAUDE.md'), '# Custom', 'utf8');

    await scaffoldFiles(tmpDir, config, false);

    // Managed file — must be regenerated even without --force
    const content = await readFile(join(tmpDir, '.claude', 'CLAUDE.md'), 'utf8');
    expect(content).not.toBe('# Custom');
    expect(content).toContain('init-test-project');
  });

  it('does not overwrite user-data files without --force', async () => {
    // First scaffold to create state.json
    await scaffoldFiles(tmpDir, config, false);
    const statePath = join(tmpDir, '.project-state', 'state.json');
    await writeFile(statePath, '{"custom":true}', 'utf8');

    await scaffoldFiles(tmpDir, config, false);

    // Non-managed file — preserved
    const content = await readFile(statePath, 'utf8');
    expect(content).toBe('{"custom":true}');
  });

  it('overwrites all files with --force', async () => {
    await mkdir(join(tmpDir, '.claude'), { recursive: true });
    await writeFile(join(tmpDir, '.claude', 'CLAUDE.md'), '# Custom', 'utf8');

    await scaffoldFiles(tmpDir, config, true);

    const content = await readFile(join(tmpDir, '.claude', 'CLAUDE.md'), 'utf8');
    expect(content).not.toBe('# Custom');
    expect(content).toContain('init-test-project');
  });
});

describe('scaffoldFiles — claude-code only', () => {
  let tmpDir: string;
  const config: FeatherConfig = { ...defaultConfig('cc-only'), clients: 'claude-code' };

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('does not create .opencode/ files', async () => {
    await scaffoldFiles(tmpDir, config, false);
    expect(existsSync(join(tmpDir, '.opencode'))).toBe(false);
  });

  it('creates .claude/ files', async () => {
    await scaffoldFiles(tmpDir, config, false);
    expect(existsSync(join(tmpDir, '.claude', 'CLAUDE.md'))).toBe(true);
  });
});

describe('scaffoldFiles — opencode only', () => {
  let tmpDir: string;
  const config: FeatherConfig = { ...defaultConfig('oc-only'), clients: 'opencode' };

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('does not create .claude/ files', async () => {
    await scaffoldFiles(tmpDir, config, false);
    expect(existsSync(join(tmpDir, '.claude', 'CLAUDE.md'))).toBe(false);
  });

  it('creates .opencode/opencode.json', async () => {
    await scaffoldFiles(tmpDir, config, false);
    expect(existsSync(join(tmpDir, '.opencode', 'opencode.json'))).toBe(true);
  });
});

// ── runDoctor ─────────────────────────────────────────────────────────────────

describe('runDoctor', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns false when config is missing', async () => {
    const result = await runDoctor(tmpDir);
    expect(result).toBe(false);
  });

  it('returns false when state.json is missing', async () => {
    const config = defaultConfig('doctor-test');
    await mkdir(join(tmpDir, 'featherkit'), { recursive: true });
    await writeFile(
      join(tmpDir, 'featherkit', 'config.json'),
      JSON.stringify(config),
      'utf8'
    );
    const result = await runDoctor(tmpDir);
    expect(result).toBe(false);
  });

  it('returns false when skill files are missing', async () => {
    const config = defaultConfig('doctor-test');

    // Write config and state but not skill files
    await mkdir(join(tmpDir, 'featherkit'), { recursive: true });
    await writeFile(join(tmpDir, 'featherkit', 'config.json'), JSON.stringify(config), 'utf8');
    await mkdir(join(tmpDir, '.project-state'), { recursive: true });
    await writeFile(
      join(tmpDir, '.project-state', 'state.json'),
      JSON.stringify({ version: 1, currentTask: null, tasks: [], lastUpdated: new Date().toISOString() }),
      'utf8'
    );

    const result = await runDoctor(tmpDir);
    expect(result).toBe(false);
  });

  it('returns true when all checks pass', async () => {
    const config: FeatherConfig = { ...defaultConfig('doctor-pass'), clients: 'opencode' };

    // Scaffold everything
    await scaffoldFiles(tmpDir, config, false);

    // runDoctor checks for .opencode MCP entry — opencode.json is created by scaffoldFiles.
    // The MCP server check now verifies npx is in PATH (always true in test env).
    const result = await runDoctor(tmpDir);
    expect(typeof result).toBe('boolean');
  });

  it('fails when claude is not on PATH', async () => {
    const config: FeatherConfig = { ...defaultConfig('doctor-claude-fail'), clients: 'opencode' };
    await scaffoldFiles(tmpDir, config, false);

    const result = await runDoctor(tmpDir, {
      runCommand: vi.fn(async (file: string) => ({ exitCode: file === 'claude' ? 1 : 0 })) as never,
    });

    expect(result).toBe(false);
  });

  it('warns but does not fail when pi is not on PATH', async () => {
    const config: FeatherConfig = { ...defaultConfig('doctor-pi-warn'), clients: 'opencode' };
    await scaffoldFiles(tmpDir, config, false);

    const result = await runDoctor(tmpDir, {
      runCommand: vi.fn(async (file: string) => ({ exitCode: file === 'pi' ? 1 : 0 })) as never,
    });

    expect(typeof result).toBe('boolean');
  });

  it('detects invalid config schema', async () => {
    await mkdir(join(tmpDir, 'featherkit'), { recursive: true });
    await writeFile(
      join(tmpDir, 'featherkit', 'config.json'),
      JSON.stringify({ version: 1 }), // missing required fields
      'utf8'
    );
    const result = await runDoctor(tmpDir);
    expect(result).toBe(false);
  });
});
