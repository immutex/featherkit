import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { defaultConfig } from '../../src/config/defaults.js';
import type { FeatherConfig, ProjectState, TaskEntry } from '../../src/config/schema.js';
import { saveState } from '../../src/mcp/state-io.js';
import { startServer, type DashboardServer } from '../../src/server/index.js';
import { DEFAULT_WORKFLOW } from '../../src/workflow/default.js';

function makeTmpDir(): string {
  return join(tmpdir(), `fa-server-${randomUUID()}`);
}

function makeConfig(): FeatherConfig {
  const config = defaultConfig('server-test');
  config.orchestrator.enabled = true;
  return config;
}

function makeTask(id: string, overrides: Partial<TaskEntry> = {}): TaskEntry {
  return {
    id,
    title: id,
    status: 'pending',
    progress: [],
    ...overrides,
  };
}

async function requestJson(
  port: number,
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<{ statusCode: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8').trim();
          resolve({
            statusCode: response.statusCode ?? 0,
            body: raw.length === 0 ? null : JSON.parse(raw),
          });
        });
      },
    );

    request.on('error', reject);
    if (body !== undefined) {
      request.write(JSON.stringify(body));
    }
    request.end();
  });
}

async function requestRaw(
  port: number,
  method: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined>; bodyText: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.resume();
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            headers: response.headers,
            bodyText: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );

    request.on('error', reject);
    request.end();
  });
}

describe('dashboard server routes', () => {
  let cwd: string;
  let previousCwd: string;
  let config: FeatherConfig;
  let server: DashboardServer;
  let dashboardDistDir: string;

  beforeEach(async () => {
    cwd = makeTmpDir();
    previousCwd = process.cwd();
    config = makeConfig();

    await mkdir(join(cwd, 'featherkit'), { recursive: true });
    await mkdir(join(cwd, '.project-state'), { recursive: true });
    await mkdir(join(cwd, 'project-docs', 'workflows'), { recursive: true });
    dashboardDistDir = join(cwd, 'dashboard-dist');
    await mkdir(join(dashboardDistDir, 'assets'), { recursive: true });

    await writeFile(join(cwd, 'featherkit', 'config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    await writeFile(
      join(dashboardDistDir, 'index.html'),
      '<!doctype html><html lang="en"><body><div id="root">Dashboard</div></body></html>\n',
      'utf8',
    );
    await writeFile(join(dashboardDistDir, 'assets', 'app-12345678.js'), 'window.__TEST__ = true;\n', 'utf8');
    await writeFile(join(dashboardDistDir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>\n', 'utf8');
    await writeFile(
      join(cwd, 'project-docs', 'workflows', 'default.json'),
      `${JSON.stringify({
        version: 1,
        start: 'frame',
        nodes: [
          { id: 'frame', role: 'frame' },
          { id: 'build', role: 'build' },
        ],
        edges: [{ from: 'frame', to: 'build' }],
      }, null, 2)}\n`,
      'utf8',
    );

    await writeFile(
      join(cwd, '.mcp.json'),
      `${JSON.stringify({
        mcpServers: {
          'existing-server': { command: 'node', args: ['server.js'] },
        },
      }, null, 2)}\n`,
      'utf8',
    );

    const state: ProjectState = {
      version: 1,
      currentTask: null,
      lastUpdated: new Date().toISOString(),
      tasks: [
        makeTask('dep-done', { status: 'done' }),
        makeTask('dep-pending'),
        makeTask('task-blockable', { status: 'active' }),
        makeTask('task-needs-deps', { dependsOn: ['dep-pending'] }),
        makeTask('task-runnable', { dependsOn: ['dep-done'] }),
      ],
    };
    
    await saveState(state, config.stateDir, cwd);
    process.chdir(cwd);
    server = await startServer(config, 0, { cwd, dashboardDistDir });
  });

  afterEach(async () => {
    await server.close();
    process.chdir(previousCwd);
    await rm(cwd, { recursive: true, force: true });
  });

  it('rejects requests without auth', async () => {
    const response = await requestJson(server.port, 'GET', '/api/state');
    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
  });

  it('answers CORS preflight requests for the dashboard dev server', async () => {
    const response = await requestRaw(server.port, 'OPTIONS', '/api/state', {
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization',
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.headers['access-control-allow-headers']).toBe('Authorization, Content-Type');
  });

  it('serves app-config.js without auth', async () => {
    const response = await requestRaw(server.port, 'GET', '/app-config.js');

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/javascript; charset=utf-8');
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.bodyText).toBe(`window.__FEATHERKIT_TOKEN__ = ${JSON.stringify(server.token)};\n`);
  });

  it('serves the dashboard index at root', async () => {
    const response = await requestRaw(server.port, 'GET', '/');

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.bodyText).toContain('<div id="root">Dashboard</div>');
  });

  it('serves hashed assets with immutable cache headers', async () => {
    const response = await requestRaw(server.port, 'GET', '/assets/app-12345678.js');

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/javascript; charset=utf-8');
    expect(response.headers['cache-control']).toBe('max-age=31536000, immutable');
    expect(response.bodyText).toContain('window.__TEST__ = true;');
  });

  it('falls back to index.html for SPA routes', async () => {
    const response = await requestRaw(server.port, 'GET', '/memory/graph');

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(response.bodyText).toContain('<div id="root">Dashboard</div>');
  });

  it('returns a helpful 404 when dashboard assets are missing', async () => {
    await server.close();
    server = await startServer(config, 0, { cwd, dashboardDistDir: join(cwd, 'missing-dashboard-dist') });

    const response = await requestJson(server.port, 'GET', '/');

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({
      error: 'Dashboard assets not found. Run `cd featherkit-dashboard && bun run build`.',
    });
  });

  it('returns state json with a valid token', async () => {
    const response = await requestJson(server.port, 'GET', '/api/state', server.token);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      currentTask: null,
      tasks: expect.arrayContaining([expect.objectContaining({ id: 'task-blockable' })]),
    });
  });

  it('runs verification for a task and persists the latest check results', async () => {
    const postResponse = await requestJson(server.port, 'POST', '/api/verification/task-runnable/run', server.token);
    expect(postResponse.statusCode).toBe(200);
    expect(postResponse.body).toMatchObject({
      lastRunAt: expect.any(String),
      checks: expect.objectContaining({
        typecheck: expect.objectContaining({ status: expect.any(String) }),
        test: expect.objectContaining({ status: expect.any(String) }),
        lint: expect.objectContaining({ status: expect.any(String) }),
      }),
    });

    const getResponse = await requestJson(server.port, 'GET', '/api/verification/task-runnable', server.token);
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.body).toMatchObject(postResponse.body as object);

    const state = JSON.parse(await readFile(join(cwd, '.project-state', 'state.json'), 'utf8')) as ProjectState;
    expect(state.tasks.find((task) => task.id === 'task-runnable')?.verification).toMatchObject(postResponse.body as object);
  });

  it('returns recent events from events.jsonl in reverse chronological order', async () => {
    await writeFile(
      join(cwd, '.project-state', 'events.jsonl'),
      [
        JSON.stringify({ type: 'phase:start', taskId: 'task-runnable', phase: 'build' }),
        JSON.stringify({ type: 'user-input', at: '2026-04-23T10:00:00.000Z', projectId: 'workspace', message: 'Ship it', requestId: 'req-1' }),
      ].join('\n') + '\n',
      'utf8',
    );

    const response = await requestJson(server.port, 'GET', '/api/events?limit=5', server.token);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({ type: 'user-input', requestId: 'req-1' }),
      expect.objectContaining({ type: 'phase:start', taskId: 'task-runnable' }),
    ]);
  });

  it('returns an empty array when there are no persisted events yet', async () => {
    const response = await requestJson(server.port, 'GET', '/api/events?limit=5', server.token);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('rejects chat messages when no orchestrator is running', async () => {
    const response = await requestJson(server.port, 'POST', '/api/chat', server.token, {
      projectId: 'workspace',
      message: 'Hello?',
    });

    expect(response.statusCode).toBe(409);
    expect(response.body).toEqual({ error: 'No orchestrator running for this project' });
  });

  it('appends chat messages to events.jsonl when the orchestrator is running', async () => {
    const nextState: ProjectState = {
      version: 1,
      currentTask: 'task-runnable',
      lastUpdated: new Date().toISOString(),
      orchestrator: { status: 'running', pid: 4321, startedAt: new Date().toISOString() },
      tasks: [
        makeTask('dep-done', { status: 'done' }),
        makeTask('dep-pending'),
        makeTask('task-blockable', { status: 'active' }),
        makeTask('task-needs-deps', { dependsOn: ['dep-pending'] }),
        makeTask('task-runnable', { dependsOn: ['dep-done'] }),
      ],
    };
    await saveState(nextState, config.stateDir, cwd);

    const response = await requestJson(server.port, 'POST', '/api/chat', server.token, {
      projectId: 'workspace',
      message: 'Please continue.',
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ ok: true, queued: true, projectId: 'workspace', requestId: expect.any(String) });

    const log = await readFile(join(cwd, '.project-state', 'events.jsonl'), 'utf8');
    expect(log).toContain('"type":"user-input"');
    expect(log).toContain('"projectId":"workspace"');
    expect(log).toContain('"taskId":"task-runnable"');
    expect(log).toContain('"message":"Please continue."');
  });

  it('rejects activating a task whose dependencies are not done', async () => {
    const response = await requestJson(server.port, 'PATCH', '/api/tasks/task-needs-deps', server.token, { status: 'active' });
    expect(response.statusCode).toBe(409);
    expect(response.body).toEqual({ error: 'Task dependencies are not complete.' });
  });

  it('blocks an active task and persists the change', async () => {
    const response = await requestJson(server.port, 'PATCH', '/api/tasks/task-blockable', server.token, { status: 'blocked' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ id: 'task-blockable', status: 'blocked' });

    const state = JSON.parse(await readFile(join(cwd, '.project-state', 'state.json'), 'utf8')) as ProjectState;
    expect(state.tasks.find((task) => task.id === 'task-blockable')?.status).toBe('blocked');
  });

  it('returns and validates workflow json', async () => {
    const getResponse = await requestJson(server.port, 'GET', '/api/workflow', server.token);
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.body).toMatchObject({ start: 'frame', nodes: expect.any(Array) });

    const putResponse = await requestJson(server.port, 'PUT', '/api/workflow', server.token, { version: 1, start: 'frame' });
    expect(putResponse.statusCode).toBe(400);
    expect(putResponse.body).toMatchObject({ error: 'Invalid workflow payload.' });
  });

  it('returns the built-in default workflow when the saved workflow file is missing', async () => {
    await rm(join(cwd, 'project-docs', 'workflows', 'default.json'));

    const response = await requestJson(server.port, 'GET', '/api/workflow', server.token);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(DEFAULT_WORKFLOW);
  });

  it('persists workflow node metadata and positions to disk on save', async () => {
    const workflow = {
      version: 1,
      start: 'build',
      nodes: [
        { id: 'build', role: 'build', model: 'openai/gpt-5.4', x: 300, y: 120, promptTemplate: 'Implement carefully' },
        { id: 'sync', role: 'sync', x: 540, y: 120 },
      ],
      edges: [{ from: 'build', to: 'sync', condition: 'pass' }],
    };

    const response = await requestJson(server.port, 'PUT', '/api/workflow', server.token, workflow);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(workflow);

    const saved = JSON.parse(await readFile(join(cwd, 'project-docs', 'workflows', 'default.json'), 'utf8'));
    expect(saved).toMatchObject(workflow);
  });

  it('creates the workflow directory when saving after the workflow file is deleted', async () => {
    await rm(join(cwd, 'project-docs', 'workflows'), { recursive: true, force: true });

    const workflow = {
      version: 1,
      start: 'frame',
      nodes: [
        { id: 'frame', role: 'frame' },
        { id: 'build', role: 'build' },
      ],
      edges: [{ from: 'frame', to: 'build' }],
    };

    const response = await requestJson(server.port, 'PUT', '/api/workflow', server.token, workflow);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(await readFile(join(cwd, 'project-docs', 'workflows', 'default.json'), 'utf8'))).toEqual(workflow);
  });

  it('rejects workflow payloads when model or promptTemplate have invalid types', async () => {
    const response = await requestJson(server.port, 'PUT', '/api/workflow', server.token, {
      version: 1,
      start: 'build',
      nodes: [
        { id: 'build', role: 'build', model: 54, promptTemplate: ['bad'] },
      ],
      edges: [],
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({
      error: 'Invalid workflow payload.',
      issues: expect.arrayContaining([
        expect.objectContaining({ path: ['nodes', 0, 'model'] }),
        expect.objectContaining({ path: ['nodes', 0, 'promptTemplate'] }),
      ]),
    });
  });

  it('rejects workflow validation when nodes are unreachable from the start node', async () => {
    const response = await requestJson(server.port, 'POST', '/api/workflow/validate', server.token, {
      version: 1,
      start: 'frame',
      nodes: [
        { id: 'frame', role: 'frame' },
        { id: 'build', role: 'build' },
        { id: 'sync', role: 'sync' },
      ],
      edges: [{ from: 'frame', to: 'build' }],
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({
      error: expect.stringContaining('Unreachable nodes: sync'),
      issues: expect.arrayContaining(['Unreachable nodes: sync']),
    });
  });

  it('sends a websocket heartbeat within five seconds', async () => {
    const heartbeat = await new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error('Timed out waiting for heartbeat'));
      }, 5_000);

      const socket = new WebSocket(`ws://127.0.0.1:${server.port}/events?token=${server.token}`);
      socket.on('message', (data) => {
        const payload = JSON.parse(String(data));
        if (payload.type === 'ping') {
          clearTimeout(timeout);
          socket.close();
          resolve(payload);
        }
      });
      socket.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    expect(heartbeat).toMatchObject({ type: 'ping', at: expect.any(String) });
  });

  describe('POST /api/tasks/:id/run', () => {
    it('queues a runnable task and persists currentTask', async () => {
      const response = await requestJson(server.port, 'POST', '/api/tasks/task-runnable/run', server.token);
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject({ ok: true, taskId: 'task-runnable', queued: true });

      const state = JSON.parse(await readFile(join(cwd, '.project-state', 'state.json'), 'utf8')) as ProjectState;
      expect(state.currentTask).toBe('task-runnable');
    });

    it('rejects running a task with unmet deps', async () => {
      const response = await requestJson(server.port, 'POST', '/api/tasks/task-needs-deps/run', server.token);
      expect(response.statusCode).toBe(409);
      expect(response.body).toMatchObject({ error: 'Task task-needs-deps is not runnable.' });
    });

    it('rejects running a nonexistent task', async () => {
      const response = await requestJson(server.port, 'POST', '/api/tasks/no-such-task/run', server.token);
      expect(response.statusCode).toBe(404);
      expect(response.body).toMatchObject({ error: 'Task no-such-task not found.' });
    });

    it('rejects running a done task', async () => {
      const response = await requestJson(server.port, 'POST', '/api/tasks/dep-done/run', server.token);
      expect(response.statusCode).toBe(409);
    });
  });

  describe('GET/PUT /api/connections', () => {
    it('returns mcp servers and provider status', async () => {
      const response = await requestJson(server.port, 'GET', '/api/connections', server.token);
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject({
        mcpServers: { 'existing-server': expect.any(Object) },
        providers: expect.any(Array),
      });
    });

    it('writes connections and persists to .mcp.json', async () => {
      const newConfig = {
        mcpServers: {
          'new-server': { command: 'npx', args: ['mcp-server'] },
        },
      };
      const response = await requestJson(server.port, 'PUT', '/api/connections', server.token, newConfig);
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject({ mcpServers: { 'new-server': expect.any(Object) } });

      const onDisk = JSON.parse(await readFile(join(cwd, '.mcp.json'), 'utf8'));
      expect(onDisk.mcpServers['new-server']).toBeDefined();
    });

    it('rejects an invalid connections payload', async () => {
      const response = await requestJson(server.port, 'PUT', '/api/connections', server.token, { mcpServers: 'not-an-object' });
      expect(response.statusCode).toBe(400);
      expect(response.body).toMatchObject({ error: 'Invalid .mcp.json payload.' });
    });
  });

  describe('GET/POST/PUT/DELETE /api/agents', () => {
    it('returns agent models with system prompts', async () => {
      const response = await requestJson(server.port, 'GET', '/api/agents', server.token);
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject({
        models: expect.arrayContaining([
          expect.objectContaining({ role: 'frame', provider: 'anthropic' }),
        ]),
      });
    });

    it('creates a new custom agent via POST', async () => {
      const response = await requestJson(server.port, 'POST', '/api/agents', server.token, {
        role: 'reviewer',
        provider: 'openai',
        model: 'gpt-5.4',
        systemPrompt: 'You are a reviewer.',
      });
      expect(response.statusCode).toBe(201);
      expect(response.body).toMatchObject({
        models: expect.arrayContaining([
          expect.objectContaining({ role: 'reviewer', provider: 'openai', model: 'gpt-5.4', systemPrompt: 'You are a reviewer.' }),
        ]),
      });

      const onDisk = JSON.parse(await readFile(join(cwd, 'featherkit', 'config.json'), 'utf8'));
      expect(onDisk.models).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: 'reviewer' }),
        ]),
      );
    });

    it('rejects creating an agent with a duplicate role', async () => {
      const response = await requestJson(server.port, 'POST', '/api/agents', server.token, {
        role: 'frame',
        provider: 'anthropic',
        model: 'claude-opus-4-7',
      });
      expect(response.statusCode).toBe(409);
      expect(response.body).toMatchObject({ error: expect.stringContaining('already exists') });
    });

    it('rejects creating an agent with an invalid role name', async () => {
      const response = await requestJson(server.port, 'POST', '/api/agents', server.token, {
        role: 'Bad Role!',
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
      });
      expect(response.statusCode).toBe(400);
      expect(response.body).toMatchObject({ error: 'Invalid agent payload.' });
    });

    it('deletes a custom agent via DELETE', async () => {
      await requestJson(server.port, 'POST', '/api/agents', server.token, {
        role: 'temp-agent',
        provider: 'openai',
        model: 'gpt-5.4-mini',
      });

      const deleteResponse = await requestJson(server.port, 'DELETE', '/api/agents/temp-agent', server.token);
      expect(deleteResponse.statusCode).toBe(200);
      expect((deleteResponse.body as { models: unknown[] }).models).toEqual(
        expect.not.arrayContaining([expect.objectContaining({ role: 'temp-agent' })]),
      );
    });

    it('rejects deleting built-in agent roles', async () => {
      const response = await requestJson(server.port, 'DELETE', '/api/agents/frame', server.token);
      expect(response.statusCode).toBe(403);
      expect(response.body).toMatchObject({ error: expect.stringContaining('Cannot delete built-in') });
    });

    it('returns 404 when deleting a non-existent role', async () => {
      const response = await requestJson(server.port, 'DELETE', '/api/agents/ghost', server.token);
      expect(response.statusCode).toBe(404);
      expect(response.body).toMatchObject({ error: expect.stringContaining('not found') });
    });

    it('saves system prompts via PUT', async () => {
      const getResponse = await requestJson(server.port, 'GET', '/api/agents', server.token);
      const models = (getResponse.body as { models: Array<{ role: string; provider: string; model: string; systemPrompt?: string }> }).models;

      const updated = models.map((m) =>
        m.role === 'frame'
          ? { ...m, systemPrompt: 'Updated frame prompt.' }
          : m,
      );

      const putResponse = await requestJson(server.port, 'PUT', '/api/agents', server.token, { models: updated });
      expect(putResponse.statusCode).toBe(200);
      expect(putResponse.body).toMatchObject({
        models: expect.arrayContaining([
          expect.objectContaining({ role: 'frame', systemPrompt: 'Updated frame prompt.' }),
        ]),
      });
    });
  });
});
