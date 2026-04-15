import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

import {
  FeatherConfigSchema,
  ProjectStateSchema,
  ModelRoleSchema,
} from '../src/config/schema.js';
import { defaultConfig, MODEL_PRESETS } from '../src/config/defaults.js';
import { loadConfig, tryLoadConfig } from '../src/config/loader.js';

// ── Schema tests ─────────────────────────────────────────────────────────────

describe('FeatherConfigSchema', () => {
  const validConfig = {
    version: 1,
    projectName: 'my-project',
    clients: 'both',
    models: [{ provider: 'anthropic', model: 'claude-sonnet-4', role: 'build' }],
    integrations: { linear: false, github: false, context7: false, webSearch: false },
    stateDir: '.project-state',
    docsDir: 'project-docs',
  };

  it('accepts a valid config', () => {
    const result = FeatherConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it('rejects missing projectName', () => {
    const result = FeatherConfigSchema.safeParse({ ...validConfig, projectName: undefined });
    expect(result.success).toBe(false);
  });

  it('rejects empty projectName', () => {
    const result = FeatherConfigSchema.safeParse({ ...validConfig, projectName: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid clients value', () => {
    const result = FeatherConfigSchema.safeParse({ ...validConfig, clients: 'vscode' });
    expect(result.success).toBe(false);
  });

  it('rejects empty models array', () => {
    const result = FeatherConfigSchema.safeParse({ ...validConfig, models: [] });
    expect(result.success).toBe(false);
  });

  it('rejects invalid model role', () => {
    const result = FeatherConfigSchema.safeParse({
      ...validConfig,
      models: [{ provider: 'anthropic', model: 'x', role: 'deploy' }],
    });
    expect(result.success).toBe(false);
  });

  it('applies default stateDir when omitted', () => {
    const { stateDir: _, ...withoutStateDir } = validConfig;
    const result = FeatherConfigSchema.safeParse(withoutStateDir);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.stateDir).toBe('.project-state');
  });

  it('applies default docsDir when omitted', () => {
    const { docsDir: _, ...withoutDocsDir } = validConfig;
    const result = FeatherConfigSchema.safeParse(withoutDocsDir);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.docsDir).toBe('project-docs');
  });

  it('rejects wrong version number', () => {
    const result = FeatherConfigSchema.safeParse({ ...validConfig, version: 2 });
    expect(result.success).toBe(false);
  });
});

describe('ProjectStateSchema', () => {
  const validState = {
    version: 1,
    currentTask: null,
    tasks: [],
    lastUpdated: new Date().toISOString(),
  };

  it('accepts a valid empty state', () => {
    const result = ProjectStateSchema.safeParse(validState);
    expect(result.success).toBe(true);
  });

  it('accepts state with tasks', () => {
    const result = ProjectStateSchema.safeParse({
      ...validState,
      currentTask: 'FEAT-001',
      tasks: [
        {
          id: 'FEAT-001',
          title: 'Add feature',
          status: 'active',
          progress: [{ timestamp: new Date().toISOString(), role: 'build', message: 'Started' }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid task status', () => {
    const result = ProjectStateSchema.safeParse({
      ...validState,
      tasks: [{ id: 'X', title: 'X', status: 'wip', progress: [] }],
    });
    expect(result.success).toBe(false);
  });
});

describe('ModelRoleSchema', () => {
  it('accepts all valid roles', () => {
    for (const role of ['frame', 'build', 'critic', 'sync']) {
      expect(ModelRoleSchema.safeParse(role).success).toBe(true);
    }
  });

  it('rejects unknown role', () => {
    expect(ModelRoleSchema.safeParse('deploy').success).toBe(false);
  });
});

// ── Defaults tests ────────────────────────────────────────────────────────────

describe('MODEL_PRESETS', () => {
  const roles = ['frame', 'build', 'critic', 'sync'];

  for (const [name, preset] of Object.entries(MODEL_PRESETS)) {
    it(`preset "${name}" covers all four roles`, () => {
      const covered = preset.map((m) => m.role);
      for (const role of roles) {
        expect(covered).toContain(role);
      }
    });

    it(`preset "${name}" is a valid model array`, () => {
      for (const m of preset) {
        expect(typeof m.provider).toBe('string');
        expect(typeof m.model).toBe('string');
        expect(roles).toContain(m.role);
      }
    });
  }
});

describe('defaultConfig', () => {
  it('returns a valid FeatherConfig', () => {
    const config = defaultConfig('test-project');
    const result = FeatherConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('uses the specified preset', () => {
    const config = defaultConfig('x', 'low-cost');
    const frameModel = config.models.find((m) => m.role === 'frame');
    expect(frameModel?.model).toBe('claude-haiku-4-5-20251001');
  });

  it('falls back to balanced for unknown preset', () => {
    const config = defaultConfig('x', 'nonexistent');
    expect(config.models.length).toBe(4);
  });
});

// ── Config loader tests ───────────────────────────────────────────────────────

describe('loadConfig', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `fa-test-${randomBytes(6).toString('hex')}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('throws descriptive error when config file is missing', async () => {
    await expect(loadConfig(tmpDir)).rejects.toThrow('featheragents init');
  });

  it('throws on invalid JSON', async () => {
    const configDir = join(tmpDir, 'featheragents');
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, 'config.json'), '{ invalid json }', 'utf8');
    await expect(loadConfig(tmpDir)).rejects.toThrow('Invalid JSON');
  });

  it('throws descriptive error listing invalid fields', async () => {
    const configDir = join(tmpDir, 'featheragents');
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, 'config.json'),
      JSON.stringify({ version: 1, projectName: '', clients: 'both', models: [], integrations: {} }),
      'utf8'
    );
    await expect(loadConfig(tmpDir)).rejects.toThrow('Invalid featheragents config');
  });

  it('returns a valid parsed config', async () => {
    const config = defaultConfig('test-proj');
    const configDir = join(tmpDir, 'featheragents');
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, 'config.json'), JSON.stringify(config), 'utf8');
    const loaded = await loadConfig(tmpDir);
    expect(loaded.projectName).toBe('test-proj');
    expect(loaded.version).toBe(1);
  });
});

describe('tryLoadConfig', () => {
  it('returns null when config is missing', async () => {
    const tmpDir = join(tmpdir(), `fa-test-${randomBytes(6).toString('hex')}`);
    const result = await tryLoadConfig(tmpDir);
    expect(result).toBeNull();
  });
});
