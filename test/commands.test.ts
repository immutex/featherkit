import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, writeFile, readFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

import { defaultConfig } from '../src/config/defaults.js';
import { saveState, loadState } from '../src/mcp/state-io.js';
import { runTaskStart, runTaskSync, runTaskLog } from '../src/commands/task.js';
import { runHandoffWrite } from '../src/commands/handoff.js';
import { runReviewPrepare } from '../src/commands/review.js';
import { runSkillsInstall, getSkillFiles } from '../src/commands/skills-install.js';
import type { ProjectState, FeatherConfig } from '../src/config/schema.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

async function setupProject(tmpDir: string, configOverrides: Partial<FeatherConfig> = {}) {
  const config: FeatherConfig = { ...defaultConfig('cmd-test'), ...configOverrides };

  // featherkit/config.json
  await mkdir(join(tmpDir, 'featherkit'), { recursive: true });
  await writeFile(
    join(tmpDir, 'featherkit', 'config.json'),
    JSON.stringify(config),
    'utf8'
  );

  // initial state
  const stateDir = join(tmpDir, '.project-state');
  await mkdir(stateDir, { recursive: true });
  await writeFile(join(stateDir, 'state.json'), JSON.stringify(freshState()), 'utf8');

  // project-docs skeleton
  await mkdir(join(tmpDir, 'project-docs', 'active'), { recursive: true });
  await mkdir(join(tmpDir, 'project-docs', 'tasks'), { recursive: true });

  return config;
}

// ── task start ────────────────────────────────────────────────────────────────

describe('runTaskStart', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    await mkdir(tmpDir, { recursive: true });
    await setupProject(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates a new task in state', async () => {
    await runTaskStart('FEAT-001', { title: 'Add login' }, tmpDir);
    const state = await loadState(undefined, tmpDir);
    expect(state.currentTask).toBe('FEAT-001');
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]!.status).toBe('active');
    expect(state.tasks[0]!.title).toBe('Add login');
  });

  it('creates the task markdown file', async () => {
    await runTaskStart('FEAT-001', { title: 'Add login' }, tmpDir);
    const taskFile = join(tmpDir, 'project-docs', 'tasks', 'FEAT-001.md');
    expect(existsSync(taskFile)).toBe(true);
    const content = await readFile(taskFile, 'utf8');
    expect(content).toContain('FEAT-001');
    expect(content).toContain('## Goal');
  });

  it('does not overwrite an existing task file', async () => {
    const taskFile = join(tmpDir, 'project-docs', 'tasks', 'FEAT-001.md');
    await writeFile(taskFile, '# Custom content', 'utf8');

    await runTaskStart('FEAT-001', {}, tmpDir);

    const content = await readFile(taskFile, 'utf8');
    expect(content).toBe('# Custom content');
  });

  it('reactivates an existing task', async () => {
    const state = freshState();
    state.tasks.push({ id: 'FEAT-001', title: 'Old', status: 'done', progress: [] });
    await saveState(state, undefined, tmpDir);

    await runTaskStart('FEAT-001', {}, tmpDir);

    const updated = await loadState(undefined, tmpDir);
    expect(updated.tasks[0]!.status).toBe('active');
    expect(updated.currentTask).toBe('FEAT-001');
  });

  it('updates title on existing task when provided', async () => {
    const state = freshState();
    state.tasks.push({ id: 'FEAT-001', title: 'Old title', status: 'pending', progress: [] });
    await saveState(state, undefined, tmpDir);

    await runTaskStart('FEAT-001', { title: 'New title' }, tmpDir);

    const updated = await loadState(undefined, tmpDir);
    expect(updated.tasks[0]!.title).toBe('New title');
  });
});

// ── task sync ─────────────────────────────────────────────────────────────────

describe('runTaskSync', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    await mkdir(tmpDir, { recursive: true });
    await setupProject(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('runs without error when no active task', async () => {
    await expect(runTaskSync(tmpDir)).resolves.toBeUndefined();
  });

  it('runs without error when there is an active task', async () => {
    const state = freshState();
    state.currentTask = 'FEAT-001';
    state.tasks.push({
      id: 'FEAT-001',
      title: 'Sync test',
      status: 'active',
      progress: [{ timestamp: new Date().toISOString(), role: 'build', message: 'done step 1' }],
    });
    await saveState(state, undefined, tmpDir);

    await expect(runTaskSync(tmpDir)).resolves.toBeUndefined();
  });
});

// ── handoff write ─────────────────────────────────────────────────────────────

describe('runHandoffWrite', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    await mkdir(tmpDir, { recursive: true });
    await setupProject(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('writes handoff to state for current task', async () => {
    const state = freshState();
    state.currentTask = 'FEAT-001';
    state.tasks.push({ id: 'FEAT-001', title: 'Test', status: 'active', progress: [] });
    await saveState(state, undefined, tmpDir);

    await runHandoffWrite(
      { from: 'build', to: 'critic', notes: 'Implementation complete' },
      tmpDir
    );

    const updated = await loadState(undefined, tmpDir);
    const task = updated.tasks.find((t) => t.id === 'FEAT-001')!;
    expect(task.handoff?.from).toBe('build');
    expect(task.handoff?.to).toBe('critic');
    expect(task.handoff?.notes).toBe('Implementation complete');
  });

  it('writes latest-handoff.md', async () => {
    const state = freshState();
    state.currentTask = 'FEAT-001';
    state.tasks.push({ id: 'FEAT-001', title: 'Test', status: 'active', progress: [] });
    await saveState(state, undefined, tmpDir);

    await runHandoffWrite(
      { from: 'build', to: 'critic', notes: 'Ready for review' },
      tmpDir
    );

    const handoffPath = join(tmpDir, 'project-docs', 'active', 'latest-handoff.md');
    expect(existsSync(handoffPath)).toBe(true);
    const content = await readFile(handoffPath, 'utf8');
    expect(content).toContain('build');
    expect(content).toContain('critic');
    expect(content).toContain('Ready for review');
  });

  it('appends a progress entry to the task', async () => {
    const state = freshState();
    state.currentTask = 'FEAT-001';
    state.tasks.push({ id: 'FEAT-001', title: 'Test', status: 'active', progress: [] });
    await saveState(state, undefined, tmpDir);

    await runHandoffWrite(
      { from: 'build', to: 'critic', notes: 'done' },
      tmpDir
    );

    const updated = await loadState(undefined, tmpDir);
    expect(updated.tasks[0]!.progress).toHaveLength(1);
    expect(updated.tasks[0]!.progress[0]!.role).toBe('build');
  });

  it('works non-interactively with explicit --task option', async () => {
    const state = freshState();
    state.tasks.push({ id: 'EXPLICIT-1', title: 'Explicit', status: 'active', progress: [] });
    await saveState(state, undefined, tmpDir);

    await runHandoffWrite(
      { from: 'frame', to: 'build', notes: 'Framing done', taskId: 'EXPLICIT-1' },
      tmpDir
    );

    const updated = await loadState(undefined, tmpDir);
    expect(updated.tasks[0]!.handoff?.from).toBe('frame');
  });

  it('trims whitespace from notes', async () => {
    const state = freshState();
    state.currentTask = 'FEAT-001';
    state.tasks.push({ id: 'FEAT-001', title: 'Test', status: 'active', progress: [] });
    await saveState(state, undefined, tmpDir);

    await runHandoffWrite(
      { from: 'build', to: 'critic', notes: '  lots of whitespace  \n\n' },
      tmpDir
    );

    const updated = await loadState(undefined, tmpDir);
    expect(updated.tasks[0]!.handoff?.notes).toBe('lots of whitespace');
  });
});

// ── review prepare ────────────────────────────────────────────────────────────

describe('runReviewPrepare', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    await mkdir(tmpDir, { recursive: true });
    await setupProject(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty string when no active task', async () => {
    const result = await runReviewPrepare(tmpDir);
    expect(result).toBe('');
  });

  it('generates checklist for active task', async () => {
    const state = freshState();
    state.currentTask = 'FEAT-001';
    state.tasks.push({
      id: 'FEAT-001',
      title: 'Add feature',
      status: 'active',
      progress: [{ timestamp: new Date().toISOString(), role: 'build', message: 'step done' }],
    });
    await saveState(state, undefined, tmpDir);

    const checklist = await runReviewPrepare(tmpDir);
    expect(checklist).toContain('FEAT-001');
    expect(checklist).toContain('Add feature');
    expect(checklist).toContain('step done');
    expect(checklist).toContain('- [ ]');
  });

  it('writes checklist to current-focus.md', async () => {
    const state = freshState();
    state.currentTask = 'FEAT-001';
    state.tasks.push({ id: 'FEAT-001', title: 'Test', status: 'active', progress: [] });
    await saveState(state, undefined, tmpDir);

    await runReviewPrepare(tmpDir);

    const focusPath = join(tmpDir, 'project-docs', 'active', 'current-focus.md');
    expect(existsSync(focusPath)).toBe(true);
    const content = await readFile(focusPath, 'utf8');
    expect(content).toContain('Review Checklist');
  });

  it('replaces existing review section on second run', async () => {
    const state = freshState();
    state.currentTask = 'FEAT-001';
    state.tasks.push({ id: 'FEAT-001', title: 'Test', status: 'active', progress: [] });
    await saveState(state, undefined, tmpDir);

    await runReviewPrepare(tmpDir);
    await runReviewPrepare(tmpDir);

    const focusPath = join(tmpDir, 'project-docs', 'active', 'current-focus.md');
    const content = await readFile(focusPath, 'utf8');
    // Should not have duplicate headers
    const count = (content.match(/# Review Checklist/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('includes existing review notes if present', async () => {
    const state = freshState();
    state.currentTask = 'FEAT-001';
    state.tasks.push({
      id: 'FEAT-001',
      title: 'Test',
      status: 'active',
      progress: [],
      reviewNotes: 'Missing edge case in validator',
    });
    await saveState(state, undefined, tmpDir);

    const checklist = await runReviewPrepare(tmpDir);
    expect(checklist).toContain('Missing edge case in validator');
  });
});

// ── skills install ────────────────────────────────────────────────────────────

describe('runSkillsInstall', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    await mkdir(tmpDir, { recursive: true });
    await setupProject(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates all skill files for claude-code', async () => {
    await setupProject(tmpDir, { clients: 'claude-code' });
    await runSkillsInstall(tmpDir);

    const expected = [
      '.claude/CLAUDE.md',
      '.claude/commands/frame.md',
      '.claude/commands/build.md',
      '.claude/commands/critic.md',
      '.claude/commands/sync.md',
    ];
    for (const f of expected) {
      expect(existsSync(join(tmpDir, f)), `Expected ${f} to exist`).toBe(true);
    }
  });

  it('overwrites existing skill files', async () => {
    const claudeDir = join(tmpDir, '.claude');
    await mkdir(claudeDir, { recursive: true });
    await writeFile(join(claudeDir, 'CLAUDE.md'), '# Old content', 'utf8');

    await runSkillsInstall(tmpDir);

    const content = await readFile(join(claudeDir, 'CLAUDE.md'), 'utf8');
    expect(content).not.toBe('# Old content');
    expect(content).toContain('cmd-test');
  });

  it('returns the list of written files', async () => {
    const files = await runSkillsInstall(tmpDir);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(f.relativePath).toBeTruthy();
      expect(f.content).toBeTruthy();
    }
  });
});

// ── runTaskLog ────────────────────────────────────────────────────────────────

describe('runTaskLog', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    await mkdir(tmpDir, { recursive: true });
    await setupProject(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('exits with error for unknown task ID', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
    await expect(runTaskLog('UNKNOWN-999', tmpDir)).rejects.toThrow();
    exitSpy.mockRestore();
  });

  it('prints task header for a known task', async () => {
    const state = freshState();
    state.tasks.push({
      id: 'FEAT-001',
      title: 'Add logging',
      status: 'active',
      progress: [
        { timestamp: '2026-04-10T14:23:00.000Z', role: 'build', message: 'Implemented handler' },
      ],
    });
    await saveState(state, undefined, tmpDir);

    // runTaskLog prints to terminal — we just verify it doesn't throw and task exists in state
    await expect(runTaskLog('FEAT-001', tmpDir)).resolves.toBeUndefined();
  });

  it('prints handoff block when task has a handoff', async () => {
    const state = freshState();
    state.tasks.push({
      id: 'FEAT-002',
      title: 'With handoff',
      status: 'done',
      progress: [],
      handoff: {
        from: 'build',
        to: 'critic',
        notes: 'Done. Please review.',
        timestamp: '2026-04-11T09:00:00.000Z',
      },
    });
    await saveState(state, undefined, tmpDir);

    await expect(runTaskLog('FEAT-002', tmpDir)).resolves.toBeUndefined();
  });

  it('prints review notes when present', async () => {
    const state = freshState();
    state.tasks.push({
      id: 'FEAT-003',
      title: 'With review',
      status: 'done',
      progress: [],
      reviewNotes: 'LGTM. All criteria met.',
    });
    await saveState(state, undefined, tmpDir);

    await expect(runTaskLog('FEAT-003', tmpDir)).resolves.toBeUndefined();
  });
});

describe('getSkillFiles', () => {
  it('returns no files for opencode-only client', () => {
    const config: FeatherConfig = { ...defaultConfig('x'), clients: 'opencode' };
    const files = getSkillFiles(config);
    expect(files).toHaveLength(0);
  });

  it('returns 5 files for claude-code client', () => {
    const config: FeatherConfig = { ...defaultConfig('x'), clients: 'claude-code' };
    const files = getSkillFiles(config);
    expect(files).toHaveLength(5);
  });

  it('returns 5 files for both client (skills are claude-code only)', () => {
    const config: FeatherConfig = { ...defaultConfig('x'), clients: 'both' };
    const files = getSkillFiles(config);
    expect(files).toHaveLength(5);
  });
});
