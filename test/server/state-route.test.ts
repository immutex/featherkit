import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FeatherConfig } from '../../src/config/schema.js';
import { loadState } from '../../src/mcp/state-io.js';
import { startServer, type DashboardServer } from '../../src/server/index.js';

function makeTmpDir(): string {
  return join(tmpdir(), `fa-state-route-${randomBytes(6).toString('hex')}`);
}

function makeConfig(): FeatherConfig {
  return {
    version: 1,
    projectName: 'FeatherKit test workspace',
    clients: 'claude-code',
    models: [{ provider: 'openai', model: 'gpt-test', role: 'build' }],
    packages: [],
    integrations: {
      linear: false,
      github: false,
      context7: false,
      webSearch: false,
      playwright: false,
    },
    stateDir: '.project-state',
    docsDir: 'project-docs',
    workflow: 'project-docs/workflows/default.json',
    memory: {
      enabled: false,
      dbPath: '.project-state/memory.db',
      tokenBudget: 2000,
      maxResults: 8,
      worthinessThreshold: 0.5,
    },
    orchestrator: {
      enabled: false,
      mode: 'manual',
      claudeCodeBinary: 'claude',
      router: { enabled: true, model: 'haiku', timeoutMs: 60_000 },
      timeouts: { phaseMinutes: 30, idleHeartbeatMinutes: 5 },
      approvalGate: { frame: 'editor', sync: 'prompt' },
      tui: { enabled: true, maxStreamLines: 40 },
    },
  };
}

async function postTask(server: DashboardServer, body: unknown): Promise<Response> {
  return fetch(`${server.url}/api/tasks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${server.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/tasks', () => {
  let tmpDir: string;
  let server: DashboardServer;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    await mkdir(tmpDir, { recursive: true });
    server = await startServer(makeConfig(), 0, { cwd: tmpDir });
  });

  afterEach(async () => {
    await server.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates a new pending task and persists it to state.json', async () => {
    const response = await postTask(server, {
      id: 'fix-tasks-b',
      title: 'Add another manual task flow',
      dependsOn: ['frame-ready'],
      goal: 'Ignored by state schema but accepted by the endpoint',
    });

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload).toMatchObject({
      id: 'fix-tasks-b',
      title: 'Add another manual task flow',
      status: 'pending',
      dependsOn: ['frame-ready'],
      progress: [],
    });
    expect(payload).not.toHaveProperty('goal');

    const state = await loadState('.project-state', tmpDir);
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]).toMatchObject({
      id: 'fix-tasks-b',
      title: 'Add another manual task flow',
      status: 'pending',
      dependsOn: ['frame-ready'],
      progress: [],
    });
    expect(state.tasks[0]).not.toHaveProperty('goal');
  });

  it('returns 400 for missing or invalid task identifiers', async () => {
    const missingIdResponse = await postTask(server, { title: 'Missing id' });
    expect(missingIdResponse.status).toBe(400);
    await expect(missingIdResponse.json()).resolves.toMatchObject({
      error: 'Task ID is required.',
    });

    const invalidIdResponse = await postTask(server, { id: 'bad task id', title: 'Has spaces' });
    expect(invalidIdResponse.status).toBe(400);
    await expect(invalidIdResponse.json()).resolves.toMatchObject({
      error: 'Task ID may only contain letters, numbers, hyphens, and underscores.',
    });
  });

  it('returns 409 when the task id already exists', async () => {
    const firstResponse = await postTask(server, { id: 'fix-tasks-b', title: 'First title' });
    expect(firstResponse.status).toBe(201);

    const duplicateResponse = await postTask(server, { id: 'fix-tasks-b', title: 'Duplicate title' });
    expect(duplicateResponse.status).toBe(409);
    await expect(duplicateResponse.json()).resolves.toMatchObject({
      error: 'Task fix-tasks-b already exists.',
    });
  });
});
