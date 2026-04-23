import { Readable } from 'node:stream';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { defaultConfig } from '../../src/config/defaults.js';
import { handleAgentsRoute } from '../../src/server/routes/agents.js';

type TestResponse = ServerResponse & {
  statusCode?: number;
  body?: string;
  headers?: Record<string, string>;
};

function createRequest(method: string, url: string, body?: unknown): IncomingMessage {
  const stream = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  return Object.assign(stream, {
    method,
    url,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
  }) as IncomingMessage;
}

function createResponse(): TestResponse {
  return {
    statusCode: 200,
    body: '',
    headers: {},
    writeHead(statusCode: number, headers?: Record<string, string>) {
      this.statusCode = statusCode;
      this.headers = headers ?? {};
      return this;
    },
    end(chunk?: string) {
      this.body = chunk ?? '';
      return this;
    },
  } as TestResponse;
}

describe('handleAgentsRoute', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function createProject() {
    const cwd = await mkdtemp(join(tmpdir(), 'featherkit-agents-route-'));
    tmpDirs.push(cwd);

    const config = defaultConfig('agents-route-test');
    config.models = [
      { role: 'frame', provider: 'anthropic', model: 'claude-sonnet-4-6' },
      { role: 'build', provider: 'openai', model: 'gpt-5.4' },
      { role: 'critic', provider: 'openrouter', model: 'z-ai/glm-5.1' },
      { role: 'sync', provider: 'openai', model: 'gpt-5.4-mini' },
    ];
    const rawConfig = {
      version: config.version,
      projectName: config.projectName,
      clients: config.clients,
      models: config.models,
      packages: config.packages,
      integrations: config.integrations,
      stateDir: config.stateDir,
      docsDir: config.docsDir,
      orchestrator: config.orchestrator,
    };

    await mkdir(join(cwd, 'featherkit'), { recursive: true });
    await writeFile(join(cwd, 'featherkit', 'config.json'), `${JSON.stringify(rawConfig, null, 2)}\n`, 'utf8');

    return { cwd, config };
  }

  it('returns config models on GET and persists updates on PUT', async () => {
    const { cwd, config } = await createProject();

    const getResponse = createResponse();
    await expect(handleAgentsRoute(createRequest('GET', '/api/agents'), getResponse, '/api/agents', { config, cwd })).resolves.toBe(true);
    expect(getResponse.statusCode).toBe(200);
    expect(JSON.parse(getResponse.body ?? '')).toEqual({ models: config.models });

    const updatedModels = config.models.map((entry) =>
      entry.role === 'build'
        ? { ...entry, provider: 'anthropic', model: 'claude-opus-4-7' }
        : entry,
    );

    const putResponse = createResponse();
    await expect(
      handleAgentsRoute(createRequest('PUT', '/api/agents', { models: updatedModels }), putResponse, '/api/agents', { config, cwd }),
    ).resolves.toBe(true);
    expect(putResponse.statusCode).toBe(200);
    expect(JSON.parse(putResponse.body ?? '')).toEqual({ models: updatedModels });

    const savedConfig = JSON.parse(await readFile(join(cwd, 'featherkit', 'config.json'), 'utf8'));
    expect(savedConfig.models).toEqual(updatedModels);
    expect(savedConfig.projectName).toBe(config.projectName);
    expect(savedConfig.memory).toBeUndefined();
    expect(savedConfig.workflow).toBeUndefined();

    const nextGetResponse = createResponse();
    await handleAgentsRoute(createRequest('GET', '/api/agents'), nextGetResponse, '/api/agents', { config, cwd });
    expect(nextGetResponse.statusCode).toBe(200);
    expect(JSON.parse(nextGetResponse.body ?? '')).toEqual({ models: updatedModels });
  });

  it('returns 409 when PUT is attempted in read-only mode', async () => {
    const { cwd, config } = await createProject();
    const originalConfig = await readFile(join(cwd, 'featherkit', 'config.json'), 'utf8');

    const response = createResponse();
    await expect(
      handleAgentsRoute(createRequest('PUT', '/api/agents', { models: config.models }), response, '/api/agents', {
        config,
        cwd,
        readOnly: true,
      }),
    ).resolves.toBe(true);

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body ?? '')).toEqual({ error: 'Dashboard server is running in read-only mode.' });
    expect(await readFile(join(cwd, 'featherkit', 'config.json'), 'utf8')).toBe(originalConfig);
  });
});
