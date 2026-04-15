import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

import { deepMerge, generateClaudeCodeConfig } from '../src/generators/claude-code.js';
import { generateOpenCodeConfig } from '../src/generators/opencode.js';
import { runMcpInstall } from '../src/commands/mcp-install.js';
import { defaultConfig } from '../src/config/defaults.js';
import { existsSync } from 'fs';

function makeTmpDir(): string {
  return join(tmpdir(), `fa-test-${randomBytes(6).toString('hex')}`);
}

// ── deepMerge ─────────────────────────────────────────────────────────────────

describe('deepMerge', () => {
  it('merges disjoint keys', () => {
    const result = deepMerge({ a: 1 }, { b: 2 });
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('preserves existing keys not in source', () => {
    const result = deepMerge({ a: 1, b: 2 }, { b: 99 });
    expect(result.a).toBe(1);
    expect(result.b).toBe(99);
  });

  it('recursively merges nested objects', () => {
    const target = { servers: { existing: { cmd: 'node' } } };
    const source = { servers: { new: { cmd: 'bun' } } };
    const result = deepMerge(target, source);
    expect((result.servers as Record<string, unknown>)['existing']).toBeDefined();
    expect((result.servers as Record<string, unknown>)['new']).toBeDefined();
  });

  it('replaces arrays rather than concatenating', () => {
    const result = deepMerge({ arr: [1, 2] }, { arr: [3, 4, 5] });
    expect(result.arr).toEqual([3, 4, 5]);
  });

  it('does not mutate the target', () => {
    const target = { a: { b: 1 } };
    deepMerge(target, { a: { c: 2 } });
    expect((target.a as Record<string, unknown>)['c']).toBeUndefined();
  });

  it('handles null source values by overwriting', () => {
    const result = deepMerge({ a: { b: 1 } }, { a: null as unknown as Record<string, unknown> });
    expect(result.a).toBeNull();
  });

  it('merges deeply nested mcpServers without clobbering existing entries', () => {
    const existing = {
      mcpServers: {
        other: { command: 'python', args: ['-m', 'server'] },
      },
    };
    const incoming = {
      mcpServers: {
        featheragents: { command: 'node', args: ['./dist/server.js'] },
      },
    };
    const result = deepMerge(existing, incoming);
    const servers = result.mcpServers as Record<string, unknown>;
    expect(servers['other']).toBeDefined();
    expect(servers['featheragents']).toBeDefined();
  });
});

// ── generateClaudeCodeConfig ──────────────────────────────────────────────────

describe('generateClaudeCodeConfig', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates settings.local.json when it does not exist', async () => {
    await generateClaudeCodeConfig(tmpDir);
    const raw = await readFile(join(tmpDir, '.claude', 'settings.local.json'), 'utf8');
    expect(raw).toBeTruthy();
  });

  it('registers featheragents MCP server', async () => {
    await generateClaudeCodeConfig(tmpDir);
    const raw = await readFile(join(tmpDir, '.claude', 'settings.local.json'), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.mcpServers?.featheragents?.command).toBe('node');
    expect(parsed.mcpServers?.featheragents?.args).toContain(
      './node_modules/featheragents/dist/server.js'
    );
  });

  it('adds mcp__featheragents__* to permissions.allow', async () => {
    await generateClaudeCodeConfig(tmpDir);
    const raw = await readFile(join(tmpDir, '.claude', 'settings.local.json'), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.permissions?.allow).toContain('mcp__featheragents__*');
  });

  it('preserves existing MCP servers', async () => {
    const claudeDir = join(tmpDir, '.claude');
    await mkdir(claudeDir, { recursive: true });
    await writeFile(
      join(claudeDir, 'settings.local.json'),
      JSON.stringify({
        mcpServers: { other: { command: 'python', args: ['-m', 'other'] } },
      }),
      'utf8'
    );

    await generateClaudeCodeConfig(tmpDir);

    const raw = await readFile(join(claudeDir, 'settings.local.json'), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.mcpServers?.other).toBeDefined();
    expect(parsed.mcpServers?.featheragents).toBeDefined();
  });

  it('preserves existing non-MCP settings', async () => {
    const claudeDir = join(tmpDir, '.claude');
    await mkdir(claudeDir, { recursive: true });
    await writeFile(
      join(claudeDir, 'settings.local.json'),
      JSON.stringify({ theme: 'dark', someOtherSetting: true }),
      'utf8'
    );

    await generateClaudeCodeConfig(tmpDir);

    const raw = await readFile(join(claudeDir, 'settings.local.json'), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.theme).toBe('dark');
    expect(parsed.someOtherSetting).toBe(true);
  });

  it('is idempotent — running twice produces the same result', async () => {
    await generateClaudeCodeConfig(tmpDir);
    const first = await readFile(join(tmpDir, '.claude', 'settings.local.json'), 'utf8');

    await generateClaudeCodeConfig(tmpDir);
    const second = await readFile(join(tmpDir, '.claude', 'settings.local.json'), 'utf8');

    expect(JSON.parse(first)).toEqual(JSON.parse(second));
  });

  it('produces valid JSON with 2-space indent', async () => {
    await generateClaudeCodeConfig(tmpDir);
    const raw = await readFile(join(tmpDir, '.claude', 'settings.local.json'), 'utf8');
    expect(raw).toContain('  ');     // indented
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});

// ── generateOpenCodeConfig ────────────────────────────────────────────────────

describe('generateOpenCodeConfig', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates opencode.json when it does not exist', async () => {
    const config = defaultConfig('test');
    await generateOpenCodeConfig(tmpDir, config);
    const raw = await readFile(join(tmpDir, '.opencode', 'opencode.json'), 'utf8');
    expect(raw).toBeTruthy();
  });

  it('registers featheragents MCP server', async () => {
    const config = defaultConfig('test');
    await generateOpenCodeConfig(tmpDir, config);
    const raw = await readFile(join(tmpDir, '.opencode', 'opencode.json'), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.mcp?.featheragents?.command).toBe('node');
    expect(parsed.mcp?.featheragents?.type).toBe('local');
    expect(parsed.mcp?.featheragents?.args).toContain(
      './node_modules/featheragents/dist/server.js'
    );
  });

  it('includes agent definitions', async () => {
    const config = defaultConfig('test');
    await generateOpenCodeConfig(tmpDir, config);
    const raw = await readFile(join(tmpDir, '.opencode', 'opencode.json'), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.agents?.builder).toBeDefined();
    expect(parsed.agents?.critic).toBeDefined();
    expect(parsed.agents?.syncer).toBeDefined();
  });

  it('preserves existing settings on merge', async () => {
    const opencodeDir = join(tmpDir, '.opencode');
    await mkdir(opencodeDir, { recursive: true });
    await writeFile(
      join(opencodeDir, 'opencode.json'),
      JSON.stringify({ theme: 'dark', mcp: { other: { command: 'python' } } }),
      'utf8'
    );

    const config = defaultConfig('test');
    await generateOpenCodeConfig(tmpDir, config);

    const raw = await readFile(join(opencodeDir, 'opencode.json'), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.theme).toBe('dark');
    expect(parsed.mcp?.other).toBeDefined();
    expect(parsed.mcp?.featheragents).toBeDefined();
  });

  it('is idempotent', async () => {
    const config = defaultConfig('test');
    await generateOpenCodeConfig(tmpDir, config);
    const first = await readFile(join(tmpDir, '.opencode', 'opencode.json'), 'utf8');

    await generateOpenCodeConfig(tmpDir, config);
    const second = await readFile(join(tmpDir, '.opencode', 'opencode.json'), 'utf8');

    expect(JSON.parse(first)).toEqual(JSON.parse(second));
  });
});

// ── runMcpInstall ─────────────────────────────────────────────────────────────

describe('runMcpInstall', () => {
  let tmpDir: string;

  async function writeConfig(dir: string, clients: 'both' | 'claude-code' | 'opencode') {
    const config = { ...defaultConfig('mcp-install-test'), clients };
    await mkdir(join(dir, 'featheragents'), { recursive: true });
    await writeFile(join(dir, 'featheragents', 'config.json'), JSON.stringify(config), 'utf8');
  }

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('registers Claude Code MCP for claude-code client', async () => {
    await writeConfig(tmpDir, 'claude-code');
    await runMcpInstall(tmpDir);
    const settings = join(tmpDir, '.claude', 'settings.local.json');
    expect(existsSync(settings)).toBe(true);
    const parsed = JSON.parse(await readFile(settings, 'utf8'));
    expect(parsed.mcpServers?.featheragents).toBeDefined();
    expect(existsSync(join(tmpDir, '.opencode', 'opencode.json'))).toBe(false);
  });

  it('registers OpenCode MCP for opencode client', async () => {
    await writeConfig(tmpDir, 'opencode');
    await runMcpInstall(tmpDir);
    const ocPath = join(tmpDir, '.opencode', 'opencode.json');
    expect(existsSync(ocPath)).toBe(true);
    const parsed = JSON.parse(await readFile(ocPath, 'utf8'));
    expect(parsed.mcp?.featheragents).toBeDefined();
    expect(existsSync(join(tmpDir, '.claude', 'settings.local.json'))).toBe(false);
  });

  it('registers both clients for both config', async () => {
    await writeConfig(tmpDir, 'both');
    await runMcpInstall(tmpDir);
    expect(existsSync(join(tmpDir, '.claude', 'settings.local.json'))).toBe(true);
    expect(existsSync(join(tmpDir, '.opencode', 'opencode.json'))).toBe(true);
  });

  it('throws when config is missing', async () => {
    await expect(runMcpInstall(tmpDir)).rejects.toThrow();
  });
});

