import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, writeFile, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { defaultConfig } from '../src/config/defaults.js';
import { loadState, saveState } from '../src/mcp/state-io.js';
import type { ProjectState } from '../src/config/schema.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

/**
 * Minimal mock of McpServer that captures registered tools so we can
 * invoke their handlers directly in tests.
 */
type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>;

class MockMcpServer {
  readonly tools = new Map<string, { description?: string; handler: ToolHandler }>();

  registerTool(
    name: string,
    config: { description?: string; inputSchema?: unknown },
    handler: ToolHandler
  ): void {
    this.tools.set(name, { description: config.description, handler });
  }
}

async function callTool(
  server: MockMcpServer,
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<string> {
  const tool = server.tools.get(toolName);
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);
  const result = await tool.handler(args);
  return result.content.map((c) => c.text).join('\n');
}

function freshState(): ProjectState {
  return {
    version: 1,
    currentTask: null,
    tasks: [],
    lastUpdated: new Date().toISOString(),
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let tmpDir: string;
let cwdSpy: ReturnType<typeof vi.spyOn>;

async function setupTmpProject() {
  tmpDir = join(tmpdir(), `fa-test-${randomBytes(6).toString('hex')}`);
  await mkdir(tmpDir, { recursive: true });

  // Write a config
  const config = defaultConfig('mcp-test-project');
  const configDir = join(tmpDir, 'featheragents');
  await mkdir(configDir, { recursive: true });
  await writeFile(join(configDir, 'config.json'), JSON.stringify(config), 'utf8');

  // Write an initial empty state
  const stateDir = join(tmpDir, '.project-state');
  await mkdir(stateDir, { recursive: true });
  await writeFile(join(stateDir, 'state.json'), JSON.stringify(freshState()), 'utf8');

  // Point process.cwd() to our temp dir
  cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
}

async function teardownTmpProject() {
  cwdSpy.mockRestore();
  await rm(tmpDir, { recursive: true, force: true });
}

// ── Tool registration ─────────────────────────────────────────────────────────

describe('registerAllTools', () => {
  it('registers all 11 expected tools', async () => {
    const { registerAllTools } = await import('../src/mcp/tools/index.js');
    const server = new MockMcpServer();
    registerAllTools(server as unknown as McpServer);

    const expectedTools = [
      'get_project_brief',
      'get_active_focus',
      'get_task',
      'start_task',
      'append_progress',
      'record_review_notes',
      'write_handoff',
      'record_decision',
      'list_tasks',
      'get_diff',
      'prepare_context_pack',
    ];

    for (const name of expectedTools) {
      expect(server.tools.has(name), `Expected tool "${name}" to be registered`).toBe(true);
    }

    expect(server.tools.size).toBe(expectedTools.length);
  });
});

// ── start_task ────────────────────────────────────────────────────────────────

describe('start_task', () => {
  beforeEach(setupTmpProject);
  afterEach(teardownTmpProject);

  it('creates a new task and sets it as current', async () => {
    const { registerStartTask } = await import('../src/mcp/tools/start-task.js');
    const server = new MockMcpServer();
    registerStartTask(server as unknown as McpServer);

    const text = await callTool(server, 'start_task', { taskId: 'FEAT-001', title: 'Add feature' });
    expect(text).toContain('FEAT-001');
    expect(text).toContain('active');

    const state = await loadState(undefined, tmpDir);
    expect(state.currentTask).toBe('FEAT-001');
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]!.status).toBe('active');
  });

  it('activates an existing task', async () => {
    const existingState = freshState();
    existingState.tasks.push({ id: 'FEAT-001', title: 'Old', status: 'pending', progress: [] });
    await saveState(existingState, undefined, tmpDir);

    const { registerStartTask } = await import('../src/mcp/tools/start-task.js');
    const server = new MockMcpServer();
    registerStartTask(server as unknown as McpServer);

    await callTool(server, 'start_task', { taskId: 'FEAT-001' });

    const state = await loadState(undefined, tmpDir);
    expect(state.tasks[0]!.status).toBe('active');
    expect(state.currentTask).toBe('FEAT-001');
  });

  it('sets assignedRole when provided', async () => {
    const { registerStartTask } = await import('../src/mcp/tools/start-task.js');
    const server = new MockMcpServer();
    registerStartTask(server as unknown as McpServer);

    await callTool(server, 'start_task', { taskId: 'FEAT-002', role: 'build' });

    const state = await loadState(undefined, tmpDir);
    expect(state.tasks[0]!.assignedRole).toBe('build');
  });
});

// ── append_progress ───────────────────────────────────────────────────────────

describe('append_progress', () => {
  beforeEach(setupTmpProject);
  afterEach(teardownTmpProject);

  it('adds a progress entry to an existing task', async () => {
    const state = freshState();
    state.tasks.push({ id: 'FEAT-001', title: 'Test', status: 'active', progress: [] });
    state.currentTask = 'FEAT-001';
    await saveState(state, undefined, tmpDir);

    const { registerAppendProgress } = await import('../src/mcp/tools/append-progress.js');
    const server = new MockMcpServer();
    registerAppendProgress(server as unknown as McpServer);

    await callTool(server, 'append_progress', {
      taskId: 'FEAT-001',
      role: 'build',
      message: 'Implemented the handler',
    });

    const updated = await loadState(undefined, tmpDir);
    expect(updated.tasks[0]!.progress).toHaveLength(1);
    expect(updated.tasks[0]!.progress[0]!.message).toBe('Implemented the handler');
    expect(updated.tasks[0]!.progress[0]!.role).toBe('build');
  });

  it('returns error message for unknown task', async () => {
    const { registerAppendProgress } = await import('../src/mcp/tools/append-progress.js');
    const server = new MockMcpServer();
    registerAppendProgress(server as unknown as McpServer);

    const text = await callTool(server, 'append_progress', {
      taskId: 'UNKNOWN',
      role: 'build',
      message: 'test',
    });
    expect(text).toContain('not found');
  });
});

// ── list_tasks ────────────────────────────────────────────────────────────────

describe('list_tasks', () => {
  beforeEach(setupTmpProject);
  afterEach(teardownTmpProject);

  it('returns "no tasks" when state is empty', async () => {
    const { registerListTasks } = await import('../src/mcp/tools/list-tasks.js');
    const server = new MockMcpServer();
    registerListTasks(server as unknown as McpServer);

    const text = await callTool(server, 'list_tasks', {});
    expect(text).toContain('No tasks');
  });

  it('lists all tasks', async () => {
    const state = freshState();
    state.tasks.push(
      { id: 'A-1', title: 'Alpha', status: 'active', progress: [] },
      { id: 'B-2', title: 'Beta', status: 'done', progress: [] }
    );
    await saveState(state, undefined, tmpDir);

    const { registerListTasks } = await import('../src/mcp/tools/list-tasks.js');
    const server = new MockMcpServer();
    registerListTasks(server as unknown as McpServer);

    const text = await callTool(server, 'list_tasks', {});
    expect(text).toContain('A-1');
    expect(text).toContain('B-2');
  });

  it('filters by status', async () => {
    const state = freshState();
    state.tasks.push(
      { id: 'A-1', title: 'Alpha', status: 'active', progress: [] },
      { id: 'B-2', title: 'Beta', status: 'done', progress: [] }
    );
    await saveState(state, undefined, tmpDir);

    const { registerListTasks } = await import('../src/mcp/tools/list-tasks.js');
    const server = new MockMcpServer();
    registerListTasks(server as unknown as McpServer);

    const text = await callTool(server, 'list_tasks', { status: 'done' });
    expect(text).toContain('B-2');
    expect(text).not.toContain('A-1');
  });

  it('marks the current task', async () => {
    const state = freshState();
    state.currentTask = 'A-1';
    state.tasks.push({ id: 'A-1', title: 'Alpha', status: 'active', progress: [] });
    await saveState(state, undefined, tmpDir);

    const { registerListTasks } = await import('../src/mcp/tools/list-tasks.js');
    const server = new MockMcpServer();
    registerListTasks(server as unknown as McpServer);

    const text = await callTool(server, 'list_tasks', {});
    expect(text).toContain('current');
  });
});

// ── record_review_notes ───────────────────────────────────────────────────────

describe('record_review_notes', () => {
  beforeEach(setupTmpProject);
  afterEach(teardownTmpProject);

  it('saves review notes to the task', async () => {
    const state = freshState();
    state.tasks.push({ id: 'FEAT-001', title: 'Test', status: 'active', progress: [] });
    await saveState(state, undefined, tmpDir);

    const { registerRecordReviewNotes } = await import('../src/mcp/tools/record-review-notes.js');
    const server = new MockMcpServer();
    registerRecordReviewNotes(server as unknown as McpServer);

    await callTool(server, 'record_review_notes', {
      taskId: 'FEAT-001',
      notes: 'LGTM, missing one edge case in validator',
    });

    const updated = await loadState(undefined, tmpDir);
    expect(updated.tasks[0]!.reviewNotes).toBe('LGTM, missing one edge case in validator');
  });

  it('also appends a progress entry', async () => {
    const state = freshState();
    state.tasks.push({ id: 'FEAT-001', title: 'Test', status: 'active', progress: [] });
    await saveState(state, undefined, tmpDir);

    const { registerRecordReviewNotes } = await import('../src/mcp/tools/record-review-notes.js');
    const server = new MockMcpServer();
    registerRecordReviewNotes(server as unknown as McpServer);

    await callTool(server, 'record_review_notes', { taskId: 'FEAT-001', notes: 'ok' });

    const updated = await loadState(undefined, tmpDir);
    expect(updated.tasks[0]!.progress).toHaveLength(1);
    expect(updated.tasks[0]!.progress[0]!.role).toBe('critic');
  });
});

// ── write_handoff ─────────────────────────────────────────────────────────────

describe('write_handoff', () => {
  beforeEach(setupTmpProject);
  afterEach(teardownTmpProject);

  it('writes handoff to state', async () => {
    const state = freshState();
    state.currentTask = 'FEAT-001';
    state.tasks.push({ id: 'FEAT-001', title: 'Test', status: 'active', progress: [] });
    await saveState(state, undefined, tmpDir);

    const { registerWriteHandoff } = await import('../src/mcp/tools/write-handoff.js');
    const server = new MockMcpServer();
    registerWriteHandoff(server as unknown as McpServer);

    await callTool(server, 'write_handoff', {
      from: 'build',
      to: 'critic',
      notes: 'Implementation done, please review the validator',
    });

    const updated = await loadState(undefined, tmpDir);
    expect(updated.tasks[0]!.handoff?.from).toBe('build');
    expect(updated.tasks[0]!.handoff?.to).toBe('critic');
    expect(updated.tasks[0]!.handoff?.notes).toContain('validator');
  });

  it('writes latest-handoff.md to project-docs', async () => {
    const state = freshState();
    state.currentTask = 'FEAT-001';
    state.tasks.push({ id: 'FEAT-001', title: 'Test', status: 'active', progress: [] });
    await saveState(state, undefined, tmpDir);

    // Create the docs directory
    await mkdir(join(tmpDir, 'project-docs', 'active'), { recursive: true });

    const { registerWriteHandoff } = await import('../src/mcp/tools/write-handoff.js');
    const server = new MockMcpServer();
    registerWriteHandoff(server as unknown as McpServer);

    await callTool(server, 'write_handoff', {
      from: 'build',
      to: 'critic',
      notes: 'All done',
    });

    const handoffMd = await readFile(
      join(tmpDir, 'project-docs', 'active', 'latest-handoff.md'),
      'utf8'
    );
    expect(handoffMd).toContain('build');
    expect(handoffMd).toContain('critic');
    expect(handoffMd).toContain('All done');
  });

  it('trims whitespace from notes', async () => {
    const state = freshState();
    state.currentTask = 'FEAT-001';
    state.tasks.push({ id: 'FEAT-001', title: 'Test', status: 'active', progress: [] });
    await saveState(state, undefined, tmpDir);

    const { registerWriteHandoff } = await import('../src/mcp/tools/write-handoff.js');
    const server = new MockMcpServer();
    registerWriteHandoff(server as unknown as McpServer);

    await callTool(server, 'write_handoff', {
      from: 'build',
      to: 'critic',
      notes: '  padded notes  \n\n',
    });

    const updated = await loadState(undefined, tmpDir);
    expect(updated.tasks[0]!.handoff?.notes).toBe('padded notes');
  });
});

// ── record_decision ───────────────────────────────────────────────────────────

describe('record_decision', () => {
  beforeEach(setupTmpProject);
  afterEach(teardownTmpProject);

  it('creates a decision file in project-docs/decisions/', async () => {
    const { registerRecordDecision } = await import('../src/mcp/tools/record-decision.js');
    const server = new MockMcpServer();
    registerRecordDecision(server as unknown as McpServer);

    const text = await callTool(server, 'record_decision', {
      title: 'Use atomic writes for state',
      body: 'We need concurrency safety between CLI and MCP server reads.',
    });

    expect(text).toContain('Decision recorded');
    expect(text).toContain('.md');

    // Verify the file was created in the decisions dir
    const { existsSync } = await import('fs');
    const { readdirSync } = await import('fs');
    const decisionsDir = join(tmpDir, 'project-docs', 'decisions');
    expect(existsSync(decisionsDir)).toBe(true);
    const files = readdirSync(decisionsDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/\.md$/);
  });

  it('uses the title and body in the file content', async () => {
    const { registerRecordDecision } = await import('../src/mcp/tools/record-decision.js');
    const server = new MockMcpServer();
    registerRecordDecision(server as unknown as McpServer);

    await callTool(server, 'record_decision', {
      title: 'Use zod v4',
      body: 'MCP SDK requires Standard Schema which is only in zod v4.',
    });

    const { readdirSync } = await import('fs');
    const decisionsDir = join(tmpDir, 'project-docs', 'decisions');
    const files = readdirSync(decisionsDir);
    const content = await readFile(join(decisionsDir, files[0]!), 'utf8');
    expect(content).toContain('Use zod v4');
    expect(content).toContain('MCP SDK requires Standard Schema');
  });

  it('uses a date-prefixed filename with slug', async () => {
    const { registerRecordDecision } = await import('../src/mcp/tools/record-decision.js');
    const server = new MockMcpServer();
    registerRecordDecision(server as unknown as McpServer);

    await callTool(server, 'record_decision', {
      title: 'Use TypeScript Strict Mode',
      body: 'Catches bugs earlier.',
    });

    const { readdirSync } = await import('fs');
    const decisionsDir = join(tmpDir, 'project-docs', 'decisions');
    const files = readdirSync(decisionsDir);
    expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}-use-typescript-strict-mode\.md$/);
  });

  it('defaults to accepted status', async () => {
    const { registerRecordDecision } = await import('../src/mcp/tools/record-decision.js');
    const server = new MockMcpServer();
    registerRecordDecision(server as unknown as McpServer);

    await callTool(server, 'record_decision', {
      title: 'Default status test',
      body: 'Should default to accepted.',
    });

    const { readdirSync } = await import('fs');
    const decisionsDir = join(tmpDir, 'project-docs', 'decisions');
    const files = readdirSync(decisionsDir);
    const content = await readFile(join(decisionsDir, files[0]!), 'utf8');
    expect(content).toContain('**Status:** accepted');
  });

  it('respects explicit status', async () => {
    const { registerRecordDecision } = await import('../src/mcp/tools/record-decision.js');
    const server = new MockMcpServer();
    registerRecordDecision(server as unknown as McpServer);

    await callTool(server, 'record_decision', {
      title: 'Proposed decision',
      body: 'Under consideration.',
      status: 'proposed',
    });

    const { readdirSync } = await import('fs');
    const decisionsDir = join(tmpDir, 'project-docs', 'decisions');
    const files = readdirSync(decisionsDir);
    const content = await readFile(join(decisionsDir, files[0]!), 'utf8');
    expect(content).toContain('**Status:** proposed');
  });
});

// ── get_diff ──────────────────────────────────────────────────────────────────

describe('get_diff', () => {
  beforeEach(setupTmpProject);
  afterEach(teardownTmpProject);

  it('returns message when no task is active and no taskId given', async () => {
    const { registerGetDiff } = await import('../src/mcp/tools/get-diff.js');
    const server = new MockMcpServer();
    registerGetDiff(server as unknown as McpServer);

    const text = await callTool(server, 'get_diff', {});
    expect(text).toContain('No task specified');
  });

  it('returns diff header for an active task with a task markdown file', async () => {
    const state = freshState();
    state.currentTask = 'FEAT-001';
    state.tasks.push({ id: 'FEAT-001', title: 'Test', status: 'active', progress: [] });
    await saveState(state, undefined, tmpDir);

    // Create task markdown with files section
    await mkdir(join(tmpDir, 'project-docs', 'tasks'), { recursive: true });
    await writeFile(
      join(tmpDir, 'project-docs', 'tasks', 'FEAT-001.md'),
      '# Task: FEAT-001\n\n## Files\nsrc/some-file.ts\n\n## Done Criteria\n- [ ] done\n',
      'utf8'
    );

    const { registerGetDiff } = await import('../src/mcp/tools/get-diff.js');
    const server = new MockMcpServer();
    registerGetDiff(server as unknown as McpServer);

    // Git diff may be empty in test environment — just verify output structure
    const text = await callTool(server, 'get_diff', {});
    expect(text).toContain('FEAT-001');
    expect(text).toContain('HEAD');
  });

  it('falls back to unscoped diff when task file has no ## Files section', async () => {
    const state = freshState();
    state.currentTask = 'FEAT-002';
    state.tasks.push({ id: 'FEAT-002', title: 'No files', status: 'active', progress: [] });
    await saveState(state, undefined, tmpDir);

    await mkdir(join(tmpDir, 'project-docs', 'tasks'), { recursive: true });
    await writeFile(
      join(tmpDir, 'project-docs', 'tasks', 'FEAT-002.md'),
      '# Task: FEAT-002\n\n## Goal\nDo something.\n',
      'utf8'
    );

    const { registerGetDiff } = await import('../src/mcp/tools/get-diff.js');
    const server = new MockMcpServer();
    registerGetDiff(server as unknown as McpServer);

    const text = await callTool(server, 'get_diff', { taskId: 'FEAT-002' });
    expect(text).toContain('FEAT-002');
    expect(text).toContain('unscoped');
  });

  it('accepts a custom base ref', async () => {
    const state = freshState();
    state.currentTask = 'FEAT-003';
    state.tasks.push({ id: 'FEAT-003', title: 'Custom base', status: 'active', progress: [] });
    await saveState(state, undefined, tmpDir);

    const { registerGetDiff } = await import('../src/mcp/tools/get-diff.js');
    const server = new MockMcpServer();
    registerGetDiff(server as unknown as McpServer);

    const text = await callTool(server, 'get_diff', { taskId: 'FEAT-003', base: 'main' });
    expect(text).toContain('main');
  });
});

// ── prepare_context_pack ──────────────────────────────────────────────────────

describe('prepare_context_pack', () => {
  beforeEach(setupTmpProject);
  afterEach(teardownTmpProject);

  async function setupTaskWithDocs(id: string) {
    const state = freshState();
    state.currentTask = id;
    state.tasks.push({
      id,
      title: 'Test task',
      status: 'active',
      progress: [
        { timestamp: new Date().toISOString(), role: 'build', message: 'Implemented handler' },
      ],
      handoff: {
        from: 'build',
        to: 'critic',
        notes: 'Implementation done',
        timestamp: new Date().toISOString(),
      },
      reviewNotes: 'LGTM.',
    });
    await saveState(state, undefined, tmpDir);

    await mkdir(join(tmpDir, 'project-docs', 'tasks'), { recursive: true });
    await mkdir(join(tmpDir, 'project-docs', 'context'), { recursive: true });
    await writeFile(
      join(tmpDir, 'project-docs', 'tasks', `${id}.md`),
      `# Task: ${id}\n\n## Goal\nDo something useful.\n\n## Files\nsrc/example.ts\n\n## Constraints\nMust not break existing tests.\n\n## Done Criteria\n- [ ] Example works\n`,
      'utf8'
    );
    await writeFile(
      join(tmpDir, 'project-docs', 'context', 'conventions.md'),
      Array.from({ length: 60 }, (_, i) => `Convention line ${i + 1}`).join('\n'),
      'utf8'
    );
  }

  it('returns a context pack for build role with goal and done criteria', async () => {
    await setupTaskWithDocs('FEAT-010');

    const { registerPrepareContextPack } = await import('../src/mcp/tools/prepare-context-pack.js');
    const server = new MockMcpServer();
    registerPrepareContextPack(server as unknown as McpServer);

    const text = await callTool(server, 'prepare_context_pack', { forRole: 'build' });
    expect(text).toContain('Task Goal');
    expect(text).toContain('Do something useful');
    expect(text).toContain('Done Criteria');
    expect(text).toContain('Latest Handoff');
    expect(text).toContain('Conventions');
    // Should NOT include diff (that's critic-only)
    expect(text).not.toContain('Diff (HEAD)');
  });

  it('returns a context pack for critic role with diff section', async () => {
    await setupTaskWithDocs('FEAT-011');

    const { registerPrepareContextPack } = await import('../src/mcp/tools/prepare-context-pack.js');
    const server = new MockMcpServer();
    registerPrepareContextPack(server as unknown as McpServer);

    const text = await callTool(server, 'prepare_context_pack', { forRole: 'critic' });
    expect(text).toContain('Diff (HEAD)');
    expect(text).toContain('Done Criteria');
    expect(text).toContain('Recent Progress');
    // Should NOT include conventions snippet (critic doesn't need it)
    expect(text).not.toContain('Convention line');
  });

  it('returns a context pack for sync role with handoff and progress', async () => {
    await setupTaskWithDocs('FEAT-012');

    const { registerPrepareContextPack } = await import('../src/mcp/tools/prepare-context-pack.js');
    const server = new MockMcpServer();
    registerPrepareContextPack(server as unknown as McpServer);

    const text = await callTool(server, 'prepare_context_pack', { forRole: 'sync' });
    expect(text).toContain('Latest Handoff');
    expect(text).toContain('Recent Progress');
    expect(text).toContain('Review Notes');
    expect(text).not.toContain('Diff (HEAD)');
  });

  it('truncates conventions snippet at 50 lines', async () => {
    await setupTaskWithDocs('FEAT-013');

    const { registerPrepareContextPack } = await import('../src/mcp/tools/prepare-context-pack.js');
    const server = new MockMcpServer();
    registerPrepareContextPack(server as unknown as McpServer);

    const text = await callTool(server, 'prepare_context_pack', { forRole: 'build' });
    expect(text).toContain('Convention line 50');
    expect(text).not.toContain('Convention line 51');
    expect(text).toContain('truncated');
  });

  it('writes pack.md to disk when writeToDisk is true', async () => {
    await setupTaskWithDocs('FEAT-014');
    await mkdir(join(tmpDir, 'project-docs', 'active'), { recursive: true });

    const { registerPrepareContextPack } = await import('../src/mcp/tools/prepare-context-pack.js');
    const server = new MockMcpServer();
    registerPrepareContextPack(server as unknown as McpServer);

    const text = await callTool(server, 'prepare_context_pack', {
      forRole: 'critic',
      writeToDisk: true,
    });
    expect(text).toContain('pack.md');

    const { existsSync } = await import('fs');
    expect(existsSync(join(tmpDir, 'project-docs', 'active', 'pack.md'))).toBe(true);
  });
});

// ── task dependencies ─────────────────────────────────────────────────────────

describe('start_task dependency warnings', () => {
  beforeEach(setupTmpProject);
  afterEach(teardownTmpProject);

  it('warns when a dependency is not done', async () => {
    const state = freshState();
    state.tasks.push({
      id: 'FEAT-001',
      title: 'First',
      status: 'active',
      progress: [],
    });
    state.tasks.push({
      id: 'FEAT-002',
      title: 'Second',
      status: 'pending',
      dependsOn: ['FEAT-001'],
      progress: [],
    });
    await saveState(state, undefined, tmpDir);

    const { registerStartTask } = await import('../src/mcp/tools/start-task.js');
    const server = new MockMcpServer();
    registerStartTask(server as unknown as McpServer);

    const text = await callTool(server, 'start_task', { taskId: 'FEAT-002' });
    expect(text).toContain('Warning');
    expect(text).toContain('FEAT-001');
  });

  it('does not warn when all dependencies are done', async () => {
    const state = freshState();
    state.tasks.push({ id: 'FEAT-001', title: 'First', status: 'done', progress: [] });
    state.tasks.push({
      id: 'FEAT-002',
      title: 'Second',
      status: 'pending',
      dependsOn: ['FEAT-001'],
      progress: [],
    });
    await saveState(state, undefined, tmpDir);

    const { registerStartTask } = await import('../src/mcp/tools/start-task.js');
    const server = new MockMcpServer();
    registerStartTask(server as unknown as McpServer);

    const text = await callTool(server, 'start_task', { taskId: 'FEAT-002' });
    expect(text).not.toContain('Warning');
  });

  it('still activates the task despite unmet dependencies (advisory only)', async () => {
    const state = freshState();
    state.tasks.push({ id: 'FEAT-001', title: 'First', status: 'active', progress: [] });
    state.tasks.push({
      id: 'FEAT-002',
      title: 'Second',
      status: 'pending',
      dependsOn: ['FEAT-001'],
      progress: [],
    });
    await saveState(state, undefined, tmpDir);

    const { registerStartTask } = await import('../src/mcp/tools/start-task.js');
    const server = new MockMcpServer();
    registerStartTask(server as unknown as McpServer);

    await callTool(server, 'start_task', { taskId: 'FEAT-002' });
    const updated = await loadState(undefined, tmpDir);
    const task = updated.tasks.find((t) => t.id === 'FEAT-002');
    expect(task?.status).toBe('active');
  });
});

describe('list_tasks dependency annotations', () => {
  beforeEach(setupTmpProject);
  afterEach(teardownTmpProject);

  it('shows blocked-by annotation for tasks with dependsOn', async () => {
    const state = freshState();
    state.tasks.push({ id: 'FEAT-001', title: 'First', status: 'done', progress: [] });
    state.tasks.push({
      id: 'FEAT-002',
      title: 'Second',
      status: 'pending',
      dependsOn: ['FEAT-001'],
      progress: [],
    });
    await saveState(state, undefined, tmpDir);

    const { registerListTasks } = await import('../src/mcp/tools/list-tasks.js');
    const server = new MockMcpServer();
    registerListTasks(server as unknown as McpServer);

    const text = await callTool(server, 'list_tasks', {});
    expect(text).toContain('blocked-by');
    expect(text).toContain('FEAT-001');
  });

  it('does not show blocked-by for tasks without dependsOn', async () => {
    const state = freshState();
    state.tasks.push({ id: 'FEAT-001', title: 'First', status: 'active', progress: [] });
    await saveState(state, undefined, tmpDir);

    const { registerListTasks } = await import('../src/mcp/tools/list-tasks.js');
    const server = new MockMcpServer();
    registerListTasks(server as unknown as McpServer);

    const text = await callTool(server, 'list_tasks', {});
    expect(text).not.toContain('blocked-by');
  });
});
