import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

import { loadState, saveState, loadConfig } from '../src/mcp/state-io.js';
import type { ProjectState, FeatherConfig } from '../src/config/schema.js';
import { defaultConfig } from '../src/config/defaults.js';

function makeTmpDir(): string {
  return join(tmpdir(), `fa-test-${randomBytes(6).toString('hex')}`);
}

function freshState(): ProjectState {
  return {
    version: 1,
    currentTask: null,
    tasks: [],
    lastUpdated: new Date().toISOString(),
  };
}

// ── loadState ─────────────────────────────────────────────────────────────────

describe('loadState', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty state when state.json does not exist', async () => {
    const state = await loadState(undefined, tmpDir);
    expect(state.version).toBe(1);
    expect(state.tasks).toEqual([]);
    expect(state.currentTask).toBeNull();
  });

  it('reads and parses a valid state file', async () => {
    const stateDir = join(tmpDir, '.project-state');
    await mkdir(stateDir, { recursive: true });
    const expected = freshState();
    expected.currentTask = 'FEAT-001';
    await writeFile(join(stateDir, 'state.json'), JSON.stringify(expected), 'utf8');

    const loaded = await loadState(undefined, tmpDir);
    expect(loaded.currentTask).toBe('FEAT-001');
  });

  it('throws on invalid state schema', async () => {
    const stateDir = join(tmpDir, '.project-state');
    await mkdir(stateDir, { recursive: true });
    await writeFile(
      join(stateDir, 'state.json'),
      JSON.stringify({ version: 99, currentTask: null, tasks: 'bad', lastUpdated: '' }),
      'utf8'
    );
    await expect(loadState(undefined, tmpDir)).rejects.toThrow('Invalid state file');
  });

  it('respects a custom stateDir', async () => {
    const customDir = join(tmpDir, 'my-state');
    await mkdir(customDir, { recursive: true });
    const state = freshState();
    state.currentTask = 'CUSTOM-1';
    await writeFile(join(customDir, 'state.json'), JSON.stringify(state), 'utf8');

    const loaded = await loadState('my-state', tmpDir);
    expect(loaded.currentTask).toBe('CUSTOM-1');
  });
});

// ── saveState ─────────────────────────────────────────────────────────────────

describe('saveState', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates the state directory if it does not exist', async () => {
    const state = freshState();
    await saveState(state, undefined, tmpDir);
    const raw = await readFile(join(tmpDir, '.project-state', 'state.json'), 'utf8');
    expect(raw).toBeTruthy();
  });

  it('writes valid JSON', async () => {
    const state = freshState();
    await saveState(state, undefined, tmpDir);
    const raw = await readFile(join(tmpDir, '.project-state', 'state.json'), 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('round-trips state correctly', async () => {
    const state = freshState();
    state.currentTask = 'RT-001';
    state.tasks.push({
      id: 'RT-001',
      title: 'Round trip test',
      status: 'active',
      progress: [{ timestamp: new Date().toISOString(), role: 'build', message: 'started' }],
    });

    await saveState(state, undefined, tmpDir);
    const loaded = await loadState(undefined, tmpDir);

    expect(loaded.currentTask).toBe('RT-001');
    expect(loaded.tasks).toHaveLength(1);
    expect(loaded.tasks[0]!.id).toBe('RT-001');
    expect(loaded.tasks[0]!.progress).toHaveLength(1);
  });

  it('updates lastUpdated on save', async () => {
    const state = freshState();
    state.lastUpdated = '1970-01-01T00:00:00.000Z';
    await saveState(state, undefined, tmpDir);
    const loaded = await loadState(undefined, tmpDir);
    expect(loaded.lastUpdated).not.toBe('1970-01-01T00:00:00.000Z');
  });

  it('overwrites existing state file', async () => {
    const state1 = freshState();
    state1.currentTask = 'FIRST';
    await saveState(state1, undefined, tmpDir);

    const state2 = freshState();
    state2.currentTask = 'SECOND';
    await saveState(state2, undefined, tmpDir);

    const loaded = await loadState(undefined, tmpDir);
    expect(loaded.currentTask).toBe('SECOND');
  });
});

// ── loadConfig (from state-io) ────────────────────────────────────────────────

describe('loadConfig (state-io)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns null when config file is missing', async () => {
    // loadConfig uses process.cwd() by default; we pass a cwd that has no config
    // We can't easily pass cwd to state-io's loadConfig directly,
    // so we write a config in the real cwd and check null for a non-existent dir
    const result = await loadConfig(tmpDir);
    expect(result).toBeNull();
  });

  it('returns parsed config when file exists', async () => {
    const config: FeatherConfig = defaultConfig('state-io-test');
    const configDir = join(tmpDir, 'featherkit');
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, 'config.json'), JSON.stringify(config), 'utf8');

    const loaded = await loadConfig(tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded?.projectName).toBe('state-io-test');
  });

  it('returns null on invalid config JSON', async () => {
    const configDir = join(tmpDir, 'featherkit');
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, 'config.json'), '{ bad json', 'utf8');

    const result = await loadConfig(tmpDir);
    expect(result).toBeNull();
  });
});
