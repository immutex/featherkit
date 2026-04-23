import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chmod, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

import { defaultConfig } from '../../src/config/defaults.js';
import type { FeatherConfig, ModelRole, ProjectState, TaskEntry } from '../../src/config/schema.js';
import { saveState, loadState } from '../../src/mcp/state-io.js';
import { makeGateHook } from '../../src/orchestrator/gates.js';
import { acquireLock } from '../../src/orchestrator/lock.js';
import { orchestrateCommand, runOrchestrateCommand } from '../../src/commands/orchestrate.js';

const runPhaseMock = vi.fn();
const routeMock = vi.fn();

vi.mock('../../src/orchestrator/runner.js', () => ({
  runPhase: (...args: unknown[]) => runPhaseMock(...args),
  runClaudeCodePhase: (...args: unknown[]) => runPhaseMock(...args),
}));

vi.mock('../../src/orchestrator/router.js', () => ({
  routeCriticResult: (...args: unknown[]) => routeMock(...args),
}));

function makeTmpDir(): string {
  return join(tmpdir(), `fa-orch-loop-${randomUUID()}`);
}

function makeConfig(): FeatherConfig {
  const config = defaultConfig('orch-loop-test');
  config.orchestrator.timeouts.idleHeartbeatMinutes = 0.0002;
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

async function writeState(tmpDir: string, tasks: TaskEntry[], currentTask: string | null = null): Promise<void> {
  await saveState(
    {
      version: 1,
      currentTask,
      tasks,
      lastUpdated: new Date().toISOString(),
    },
    undefined,
    tmpDir,
  );
}

async function appendCompletion(tmpDir: string, taskId: string, phase: ModelRole, verdict?: 'pass' | 'warn' | 'fail'): Promise<void> {
  const state = await loadState(undefined, tmpDir);
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) throw new Error(`Missing task ${taskId}`);

  task.phaseCompletions = [
    ...(task.phaseCompletions ?? []),
    {
      phase,
      summary: `${phase} complete`,
      completedAt: new Date().toISOString(),
      ...(verdict ? { verdict } : {}),
    },
  ];

  await saveState(state, undefined, tmpDir);
}

async function writeExecutable(filePath: string, body: string): Promise<void> {
  await writeFile(filePath, body, 'utf8');
  await chmod(filePath, 0o755);
}

describe('orchestrator loop and lock', async () => {
  let tmpDir: string;
  let previousCwd: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    previousCwd = process.cwd();
    await mkdir(join(tmpDir, 'featherkit'), { recursive: true });
    await mkdir(join(tmpDir, '.project-state'), { recursive: true });
    await writeFile(join(tmpDir, 'featherkit', 'config.json'), JSON.stringify(makeConfig(), null, 2) + '\n', 'utf8');
    process.chdir(tmpDir);
    runPhaseMock.mockReset();
    routeMock.mockReset();
    routeMock.mockImplementation(async (task: TaskEntry) => {
      const lastCritic = [...(task.phaseCompletions ?? [])]
        .reverse()
        .find((completion) => completion.phase === 'critic');
      return lastCritic?.verdict === 'fail' ? 'loopback' : 'advance';
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(previousCwd);
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('drives a task from frame to sync and marks it done', async () => {
    const events: string[] = [];
    await writeState(tmpDir, [makeTask('ORCH-C-1')]);

    runPhaseMock.mockImplementation(async (task: TaskEntry, phase: ModelRole) => {
      await appendCompletion(tmpDir, task.id, phase, phase === 'critic' ? 'pass' : undefined);
      return { status: 'ok', stdout: '', stderr: '', durationMs: 1 };
    });

    const { runOrchestrator } = await import('../../src/orchestrator/loop.js');
    await runOrchestrator(makeConfig(), {
      onEvent: (event) => {
        events.push(event.type === 'phase:start' ? `${event.type}:${event.phase}` : event.type);
      },
    }, { once: true });

    const state = await loadState(undefined, tmpDir);
    expect(state.tasks[0]?.status).toBe('done');
    expect(events).toEqual([
      'phase:start:frame',
      'phase:complete',
      'gate:awaiting',
      'gate:approved',
      'phase:start:build',
      'phase:complete',
      'phase:start:critic',
      'phase:complete',
      'gate:awaiting',
      'gate:approved',
      'phase:start:sync',
      'phase:complete',
      'task:done',
    ]);
  });

  it('loops back from critic fail to build until critic passes', async () => {
    await writeState(tmpDir, [makeTask('ORCH-C-2')]);
    const phases: ModelRole[] = [];
    let criticRuns = 0;

    runPhaseMock.mockImplementation(async (task: TaskEntry, phase: ModelRole) => {
      phases.push(phase);
      if (phase === 'critic') {
        criticRuns += 1;
        await appendCompletion(tmpDir, task.id, phase, criticRuns === 1 ? 'fail' : 'pass');
      } else {
        await appendCompletion(tmpDir, task.id, phase);
      }

      return { status: 'ok', stdout: '', stderr: '', durationMs: 1 };
    });

    const { runOrchestrator } = await import('../../src/orchestrator/loop.js');
    await runOrchestrator(makeConfig(), undefined, { once: true });

    const state = await loadState(undefined, tmpDir);
    expect(state.tasks[0]?.status).toBe('done');
    expect(phases).toEqual(['frame', 'build', 'critic', 'build', 'critic', 'sync']);
  });

  it('prefers currentTask and otherwise picks the oldest runnable pending task', async () => {
    await writeState(tmpDir, [
      makeTask('DONE', { status: 'done' }),
      makeTask('BLOCKED', { dependsOn: ['DONE', 'MISSING'] }),
      makeTask('SECOND'),
      makeTask('FIRST'),
    ], 'SECOND');

    runPhaseMock.mockImplementation(async (task: TaskEntry, phase: ModelRole) => {
      await appendCompletion(tmpDir, task.id, phase, phase === 'critic' ? 'pass' : undefined);
      return { status: 'ok', stdout: '', stderr: '', durationMs: 1 };
    });

    const { runOrchestrator } = await import('../../src/orchestrator/loop.js');
    await runOrchestrator(makeConfig(), undefined, { once: true });

    let state = await loadState(undefined, tmpDir);
    expect(state.tasks.find((task) => task.id === 'SECOND')?.status).toBe('done');
    expect(state.tasks.find((task) => task.id === 'FIRST')?.status).toBe('pending');

    await writeState(tmpDir, state.tasks, null);
    await runOrchestrator(makeConfig(), undefined, { once: true });

    state = await loadState(undefined, tmpDir);
    expect(state.tasks.find((task) => task.id === 'FIRST')?.status).toBe('done');
  });

  it('dry-run logs the next phase without calling the runner', async () => {
    const lines: string[] = [];
    await writeState(tmpDir, [makeTask('ORCH-C-DRY')]);

    const { runOrchestrator } = await import('../../src/orchestrator/loop.js');
    await runOrchestrator(makeConfig(), {
      onEvent: (event) => {
        if (event.type === 'phase:stdout') lines.push(event.line);
      },
    }, { dryRun: true });

    expect(runPhaseMock).not.toHaveBeenCalled();
    expect(lines).toEqual(['[dry-run] Would run /frame on task ORCH-C-DRY']);
  });

  it('falls back to the embedded workflow and warns when the configured workflow file is invalid', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await writeState(tmpDir, [makeTask('ORCH-C-WARN')]);
    await writeFile(join(tmpDir, 'bad-workflow.json'), '{ not json', 'utf8');

    runPhaseMock.mockImplementation(async (task: TaskEntry, phase: ModelRole) => {
      await appendCompletion(tmpDir, task.id, phase, phase === 'critic' ? 'pass' : undefined);
      return { status: 'ok', stdout: '', stderr: '', durationMs: 1 };
    });

    const config = makeConfig();
    config.workflow = 'bad-workflow.json';

    const { runOrchestrator } = await import('../../src/orchestrator/loop.js');
    await runOrchestrator(config, undefined, { once: true });

    const state = await loadState(undefined, tmpDir);
    expect(state.tasks[0]?.status).toBe('done');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[feather] workflow:fallback'));

    errorSpy.mockRestore();
  });

  it('uses workflow routing after critic results instead of hardcoded build/sync overrides', async () => {
    await writeState(tmpDir, [makeTask('ORCH-C-ROUTE')]);
    const phases: ModelRole[] = [];

    runPhaseMock.mockImplementation(async (task: TaskEntry, phase: ModelRole) => {
      phases.push(phase);
      await appendCompletion(tmpDir, task.id, phase, phase === 'critic' ? 'warn' : undefined);
      return { status: 'ok', stdout: '', stderr: '', durationMs: 1 };
    });

    routeMock.mockResolvedValue('advance');

    const { runOrchestrator } = await import('../../src/orchestrator/loop.js');
    await runOrchestrator(makeConfig(), undefined, { once: true });

    expect(phases).toEqual(['frame', 'build', 'critic', 'sync']);
  });

  it('warns when the workflow stalls before all roles are completed', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await writeState(tmpDir, [makeTask('ORCH-C-STALL')]);

    const config = makeConfig();
    config.workflow = 'stalled-workflow.json';

    await writeFile(join(tmpDir, 'stalled-workflow.json'), JSON.stringify({
      version: 1,
      start: 'frame',
      nodes: [
        { id: 'frame', role: 'frame' },
        { id: 'build', role: 'build' },
      ],
      edges: [],
    }, null, 2), 'utf8');

    runPhaseMock.mockImplementation(async (task: TaskEntry, phase: ModelRole) => {
      await appendCompletion(tmpDir, task.id, phase);
      return { status: 'ok', stdout: '', stderr: '', durationMs: 1 };
    });

    const { runOrchestrator } = await import('../../src/orchestrator/loop.js');
    await runOrchestrator(config, undefined, { once: true });

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[feather] workflow:stalled task=ORCH-C-STALL remaining=build'));

    errorSpy.mockRestore();
  });

  it('blocks the next agent phase when a workflow requires check fails', async () => {
    await writeState(tmpDir, [makeTask('ORCH-C-VERIFY')]);
    await writeFile(
      join(tmpDir, 'requires-workflow.json'),
      JSON.stringify({
        version: 1,
        start: 'frame',
        nodes: [
          { id: 'frame', role: 'frame' },
          { id: 'build', role: 'build', requires: ['typecheck'] },
          { id: 'critic', role: 'critic' },
          { id: 'sync', role: 'sync' },
        ],
        edges: [
          { from: 'frame', to: 'build' },
          { from: 'build', to: 'critic' },
          { from: 'critic', to: 'sync' },
        ],
      }, null, 2),
      'utf8',
    );
    await writeFile(
      join(tmpDir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { noEmit: true, strict: true }, include: ['broken.ts'] }, null, 2),
      'utf8',
    );
    await writeFile(join(tmpDir, 'broken.ts'), 'const broken: string = 123;\n', 'utf8');
    await mkdir(join(tmpDir, 'node_modules', '.bin'), { recursive: true });
    await writeExecutable(
      join(tmpDir, 'node_modules', '.bin', 'tsc'),
      `#!/usr/bin/env bash
printf 'broken.ts(1,7): error TS2322: Type \'number\' is not assignable to type \'string\'.\n' >&2
exit 1
`,
    );
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ name: 'orch-verify-test' }, null, 2), 'utf8');

    const phases: ModelRole[] = [];
    runPhaseMock.mockImplementation(async (task: TaskEntry, phase: ModelRole) => {
      phases.push(phase);
      await appendCompletion(tmpDir, task.id, phase, phase === 'critic' ? 'pass' : undefined);
      return { status: 'ok', stdout: '', stderr: '', durationMs: 1 };
    });

    const config = makeConfig();
    config.workflow = 'requires-workflow.json';

    const { runOrchestrator } = await import('../../src/orchestrator/loop.js');
    await runOrchestrator(config, undefined, { once: true });

    const state = await loadState(undefined, tmpDir);
    const task = state.tasks.find((entry) => entry.id === 'ORCH-C-VERIFY');
    expect(task?.status).toBe('blocked');
    expect(task?.verification?.checks.typecheck?.status).toBe('fail');
    expect(task?.progress.at(-1)?.message).toContain('Verification blocked build');
    expect(phases).toEqual(['frame']);
  });

  it('acquires, heartbeats, and releases the project lock', async () => {
    await writeState(tmpDir, []);
    const config = makeConfig();

    const release = await acquireLock(config);
    const initial = await loadState(undefined, tmpDir);
    const initialHeartbeat = initial.orchestrator?.heartbeatAt;

    expect(initial.orchestrator?.status).toBe('running');
    expect(initial.orchestrator?.pid).toBe(process.pid);

    await new Promise((resolve) => setTimeout(resolve, 25));

    const afterHeartbeat = await loadState(undefined, tmpDir);
    expect(afterHeartbeat.orchestrator?.heartbeatAt).not.toBe(initialHeartbeat);

    await release();

    const released = await loadState(undefined, tmpDir);
    expect(released.orchestrator?.status).toBe('idle');
  });

  it('rejects a second live lock and clears a stale lock', async () => {
    await writeState(tmpDir, []);
    const config = makeConfig();
    const release = await acquireLock(config);

    await expect(acquireLock(config)).rejects.toThrow(`PID ${process.pid}`);
    await release();

    await writeState(tmpDir, []);
    const staleState = await loadState(undefined, tmpDir);
    staleState.orchestrator = {
      status: 'running',
      pid: 424242,
      startedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
    };
    await saveState(staleState, undefined, tmpDir);

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(((pid: number, signal?: number | NodeJS.Signals) => {
      if (pid === 424242 && signal === 0) {
        const error = new Error('no such process') as NodeJS.ErrnoException;
        error.code = 'ESRCH';
        throw error;
      }
      return true;
    }) as typeof process.kill);

    const staleRelease = await acquireLock(config);
    await staleRelease();

    expect(stderrSpy).toHaveBeenCalledWith('[feather] orchestrator:stale-lock-cleared stalePid=424242\n');
    killSpy.mockRestore();
  });

  it('releases the lock on SIGINT and exposes help flags', async () => {
    const release = vi.fn(async () => undefined);
    let sigintHandler: (() => void | Promise<void>) | undefined;
    const exitError = new Error('exit');
    const stderr: string[] = [];

    const runPromise = runOrchestrateCommand(
      { once: true, dryRun: true },
      tmpDir,
      {
        loadConfig: async () => makeConfig(),
        acquireLock: async () => release,
        makeGateHook,
        runOrchestrator: async () => {
          await sigintHandler?.();
        },
        writeStderr: (message) => {
          stderr.push(message);
        },
        onSigint: (handler) => {
          sigintHandler = handler;
        },
        offSigint: () => undefined,
        exit: () => {
          throw exitError;
        },
      },
    );

    await expect(runPromise).rejects.toBe(exitError);
    expect(release).toHaveBeenCalledTimes(1);
    expect(stderr).toContain('[feather] orchestrator:lock-acquired pid=' + process.pid + '\n');
    expect(stderr).toContain('[feather] orchestrator:lock-released\n');

    const help = orchestrateCommand.helpInformation();
    expect(help).toContain('--task <id>');
    expect(help).toContain('--once');
    expect(help).toContain('--dry-run');
  });
});
