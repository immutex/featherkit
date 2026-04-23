import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runAuthLogin, runAuthLogout, runAuthStatus } from '../src/commands/auth.js';

describe('auth command helpers', () => {
  let claudeDir: string;
  const loadConfigMock = vi.fn();
  const createPiLoaderMock = vi.fn();
  const runCommandMock = vi.fn();
  const writeStdoutMock = vi.fn();
  const hasAuthMock = vi.fn();
  const getAuthMock = vi.fn();
  const removeAuthMock = vi.fn();

  beforeEach(() => {
    claudeDir = join(tmpdir(), `fk-auth-${randomUUID()}`);
    loadConfigMock.mockReset();
    createPiLoaderMock.mockReset();
    runCommandMock.mockReset();
    writeStdoutMock.mockReset();
    hasAuthMock.mockReset();
    getAuthMock.mockReset();
    removeAuthMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const deps = {
    claudeDir,
    createPiAuthStorage: () => ({
      get: getAuthMock,
      hasAuth: hasAuthMock,
      remove: removeAuthMock,
    }),
    createPiLoader: createPiLoaderMock,
    getAgentDir: () => '/tmp/pi',
    loadConfig: loadConfigMock,
    runCommand: runCommandMock,
    writeStdout: writeStdoutMock,
  };

  it('prints a claude row in auth status output', async () => {
    await mkdir(claudeDir, { recursive: true });
    await writeFile(join(claudeDir, 'session.json'), '{}', 'utf8');
    loadConfigMock.mockResolvedValue({
      models: [
        { role: 'build', provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
        { role: 'critic', provider: 'openai', model: 'gpt-5' },
      ],
    });
    createPiLoaderMock.mockResolvedValue({
      listProviders: vi.fn().mockResolvedValue([{ provider: 'openai', models: ['gpt-5'] }]),
    });
    runCommandMock.mockResolvedValue({ exitCode: 0 });
    hasAuthMock.mockResolvedValue(false);

    await runAuthStatus('/tmp/project', deps as never);

    expect(writeStdoutMock).toHaveBeenCalledTimes(1);
    expect(writeStdoutMock.mock.calls[0]?.[0]).toContain('claude');
    expect(writeStdoutMock.mock.calls[0]?.[0]).toMatch(/claude\s+anthropic\s+(connected|disconnected)/);
  });

  it('prints the claude CLI instruction for anthropic login', async () => {
    await runAuthLogin('anthropic', '/tmp/project', deps as never);
    expect(writeStdoutMock).toHaveBeenCalledWith('Run `claude auth login` to authenticate.\n');
    expect(runCommandMock).not.toHaveBeenCalled();
  });

  it('shells out to pi login for non-claude providers', async () => {
    runCommandMock.mockResolvedValue({ exitCode: 0, stderr: '' });

    await runAuthLogin('openai', '/tmp/project', deps as never);

    expect(runCommandMock).toHaveBeenCalledWith('pi', ['login', 'openai'], expect.objectContaining({ stdio: 'inherit' }));
  });

  it('removes stored pi auth on logout', async () => {
    await runAuthLogout('openai', deps as never);
    expect(removeAuthMock).toHaveBeenCalledWith('openai');
    expect(writeStdoutMock).toHaveBeenCalledWith('Removed stored auth for openai.\n');
  });
});
