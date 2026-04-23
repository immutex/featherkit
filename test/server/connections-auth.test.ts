import { describe, expect, it, vi } from 'vitest';

import { defaultConfig } from '../../src/config/defaults.js';
import { listConnectionProviders } from '../../src/server/routes/connections.js';

describe('listConnectionProviders', () => {
  it('returns a Claude provider entry with auth status', async () => {
    const config = defaultConfig('connections-auth');

    const providers = await listConnectionProviders(config, '/tmp/project', {
      claudeDir: '/missing',
      createPiAuthStorage: () => ({
        get: vi.fn(),
        hasAuth: vi.fn().mockResolvedValue(false),
      }),
      createPiLoader: vi.fn().mockResolvedValue({
        listProviders: vi.fn().mockResolvedValue([{ provider: 'openai', models: ['gpt-5'] }]),
      }) as never,
      getAgentDir: () => '/tmp/pi',
      runCommand: vi.fn(async (file: string) => ({ exitCode: file === 'claude' ? 0 : 1 })) as never,
    });

    expect(providers[0]).toMatchObject({
      provider: 'anthropic',
      label: 'Claude',
      authType: 'cli',
    });
  });

  it('marks Pi providers as connected when auth storage has credentials', async () => {
    const config = defaultConfig('connections-openai');
    config.models = [
      { role: 'build', provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
      { role: 'critic', provider: 'openai', model: 'gpt-5' },
    ];

    const providers = await listConnectionProviders(config, '/tmp/project', {
      claudeDir: '/missing',
      createPiAuthStorage: () => ({
        get: vi.fn().mockResolvedValue({ expires: Date.now() + 60_000 }),
        hasAuth: vi.fn().mockResolvedValue(true),
      }),
      createPiLoader: vi.fn().mockResolvedValue({
        listProviders: vi.fn().mockResolvedValue([{ provider: 'openai', models: ['gpt-5'] }]),
      }) as never,
      getAgentDir: () => '/tmp/pi',
      runCommand: vi.fn(async (file: string) => ({ exitCode: file === 'pi' ? 0 : 1 })) as never,
    });

    expect(providers.find((provider) => provider.provider === 'openai')).toMatchObject({
      status: 'connected',
      connected: true,
    });
  });
});
