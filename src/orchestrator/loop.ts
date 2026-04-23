import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { FeatherConfig, ModelRole, TaskEntry, ProjectState } from '../config/schema.js';
import { openMemoryDb, type MemoryDb } from '../memory/db.js';
import { retrieveMemoryContext, type RetrievalTrace } from '../memory/retrieval/index.js';
import { writePhaseMemories } from '../memory/write/index.js';
import { loadState, saveState } from '../mcp/state-io.js';
import { DEFAULT_WORKFLOW } from '../workflow/default.js';
import { nextStep } from '../workflow/engine.js';
import { WorkflowSchema, type Workflow } from '../workflow/schema.js';
import { createEventLogger } from './event-log.js';
import { publishOrchestratorEvent, type OrchestratorEvent, type PhaseRunStatus } from './events.js';
import { GatePauseError } from './gates.js';
import { routeCriticResult } from './router.js';
import { runPhase } from './runner.js';

function loadWorkflow(config: FeatherConfig, cwd: string): Workflow {
  const workflowPath = resolve(cwd, config.workflow);

  try {
    const raw = JSON.parse(readFileSync(workflowPath, 'utf-8'));
    return WorkflowSchema.parse(raw);
  } catch (error) {
    const isMissingFile = typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';

    if (!isMissingFile) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[feather] workflow:fallback path=${workflowPath} reason=${message}`);
    }

    return DEFAULT_WORKFLOW;
  }
}

export interface OrchestratorHooks {
  onGateRequired?: (task: TaskEntry, phase: 'frame' | 'sync') => Promise<void>;
  onEvent?: (event: OrchestratorEvent) => void;
}

export interface OrchestratorRunOpts {
  taskId?: string;
  once?: boolean;
  dryRun?: boolean;
  cwd?: string;
}

type MemoryTraceRecord = {
  taskId: string;
  phase: ModelRole;
  sessionId: string | null;
  recordedAt: string;
  trace: RetrievalTrace;
};

/** Persisted trace file shape — an array of per-phase records, newest last. */
type MemoryTraceFile = MemoryTraceRecord[];

function emit(hooks: OrchestratorHooks | undefined, event: OrchestratorEvent): void {
  publishOrchestratorEvent(event);

  try {
    hooks?.onEvent?.(event);
  } catch {
    // Event listeners must not break the orchestrator loop.
  }
}

function isTaskRunnable(task: TaskEntry, state: ProjectState): boolean {
  if (task.status === 'done' || task.status === 'blocked') return false;
  return (task.dependsOn ?? []).every((dependencyId) =>
    state.tasks.some((candidate) => candidate.id === dependencyId && candidate.status === 'done')
  );
}

function pickTask(state: ProjectState, requestedTaskId?: string): TaskEntry | null {
  if (requestedTaskId) {
    const requestedTask = state.tasks.find((task) => task.id === requestedTaskId);
    return requestedTask && isTaskRunnable(requestedTask, state) ? requestedTask : null;
  }

  const currentTask = state.currentTask
    ? state.tasks.find((task) => task.id === state.currentTask)
    : undefined;
  if (currentTask && isTaskRunnable(currentTask, state)) return currentTask;

  return state.tasks.find((task) => task.status === 'pending' && isTaskRunnable(task, state)) ?? null;
}

function nextPhase(task: TaskEntry, workflow: Workflow): ModelRole | null {
  const phase = nextStep(task, workflow);
  if (phase !== null) {
    return phase;
  }

  const completedRoles = new Set((task.phaseCompletions ?? []).map((completion) => completion.phase));
  const remainingRoles = workflow.nodes
    .filter((node) => !completedRoles.has(node.role))
    .map((node) => node.role);

  if (remainingRoles.length > 0) {
    console.error(`[feather] workflow:stalled task=${task.id} remaining=${remainingRoles.join(',')}`);
  }

  return null;
}

async function setTaskStatus(
  config: FeatherConfig,
  taskId: string,
  status: TaskEntry['status'],
  currentTask: string | null,
  cwd: string,
): Promise<void> {
  const state = await loadState(config.stateDir, cwd);
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) return;

  task.status = status;
  state.currentTask = currentTask;
  await saveState(state, config.stateDir, cwd);
}

async function persistCriticRoute(
  config: FeatherConfig,
  taskId: string,
  route: 'advance' | 'loopback' | 'blocked',
  cwd: string,
): Promise<void> {
  const state = await loadState(config.stateDir, cwd);
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task?.phaseCompletions?.length) return;

  const latestCriticIndex = [...task.phaseCompletions]
    .map((completion, index) => ({ completion, index }))
    .reverse()
    .find((entry) => entry.completion.phase === 'critic')?.index;

  if (latestCriticIndex === undefined) return;

  task.phaseCompletions[latestCriticIndex] = {
    ...task.phaseCompletions[latestCriticIndex],
    verdict: route === 'advance'
      ? task.phaseCompletions[latestCriticIndex]?.verdict === 'pass'
        ? 'pass'
        : 'warn'
      : 'fail',
  };

  await saveState(state, config.stateDir, cwd);
}

async function awaitGate(
  config: FeatherConfig,
  hooks: OrchestratorHooks | undefined,
  taskId: string,
  phase: 'frame' | 'sync',
  cwd: string,
): Promise<boolean> {
  const state = await loadState(config.stateDir, cwd);
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) return false;

  emit(hooks, { type: 'gate:awaiting', taskId, phase });

  try {
    if (hooks?.onGateRequired) {
      await hooks.onGateRequired(task, phase);
    }
    emit(hooks, { type: 'gate:approved', taskId, phase });
    return true;
  } catch (error) {
    if (error instanceof GatePauseError) {
      throw error;
    }

    emit(hooks, {
      type: 'phase:failed',
      taskId,
      phase,
      reason: error instanceof Error ? error.message : String(error),
    });
      await setTaskStatus(config, taskId, 'blocked', null, cwd);
      return false;
  }
}

function failureReason(status: PhaseRunStatus, stderr: string): string {
  if (stderr.trim().length > 0) return stderr.trim();
  return `Phase ended with status ${status}`;
}

function resolveMemoryDbPath(config: FeatherConfig, cwd: string): string {
  return config.memory.dbPath === ':memory:' ? ':memory:' : join(cwd, config.memory.dbPath);
}

function buildMemoryPromptBlock(block: string): string | undefined {
  const trimmed = block.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return `<memory>\n${trimmed}\n</memory>`;
}

function logMemoryRetrieval(db: MemoryDb, task: TaskEntry, phase: ModelRole, trace: RetrievalTrace): void {
  if (trace.included.length === 0) {
    return;
  }

  const timestamp = Date.now();
  const actor = task.sessionId ? `memory-read:${task.sessionId}` : 'memory-read:pending-session';
  const reason = `orchestrator:${phase}:${task.id}`;
  const statement = db.prepare(
    'INSERT INTO memory_access_log (id, memory_id, actor, reason, accessed_at) VALUES (hex(randomblob(16)), ?, ?, ?, ?)',
  );

  for (const memory of trace.included) {
    statement.run(memory.memoryId, actor, reason, timestamp);
  }
}

async function persistMemoryTrace(
  config: FeatherConfig,
  task: TaskEntry,
  phase: ModelRole,
  trace: RetrievalTrace,
  cwd: string,
): Promise<void> {
  const traceDirectory = join(cwd, config.stateDir, 'memory-traces');
  const tracePath = join(traceDirectory, `${task.id}.json`);
  const record: MemoryTraceRecord = {
    taskId: task.id,
    phase,
    sessionId: task.sessionId ?? null,
    recordedAt: new Date().toISOString(),
    trace,
  };

  // Read existing trace array (if any) and append the new record.
  let existing: MemoryTraceFile = [];
  try {
    const raw = await readFile(tracePath, 'utf8');
    existing = JSON.parse(raw) as MemoryTraceFile;
  } catch {
    // First trace for this task — start with an empty array.
  }

  await mkdir(traceDirectory, { recursive: true });
  await writeFile(tracePath, JSON.stringify([...existing, record], null, 2) + '\n', 'utf8');
}

export async function runOrchestrator(
  config: FeatherConfig,
  hooks?: OrchestratorHooks,
  opts?: OrchestratorRunOpts,
): Promise<void> {
  const cwd = opts?.cwd ?? process.cwd();
  const workflow = loadWorkflow(config, cwd);
  const memoryDb = config.memory.enabled ? openMemoryDb(resolveMemoryDbPath(config, cwd)) : null;
  const eventLogger = createEventLogger(config.stateDir, cwd);
  const runtimeHooks: OrchestratorHooks = {
    ...hooks,
    onEvent: (event) => {
      eventLogger.emit(event);
      hooks?.onEvent?.(event);
    },
  };

  try {
    while (true) {
      const state = await loadState(config.stateDir, cwd);
      const task = pickTask(state, opts?.taskId);
      if (!task) return;

      if (task.status === 'pending') task.status = 'active';
      state.currentTask = task.id;
      await saveState(state, config.stateDir, cwd);

      if (opts?.dryRun) {
        const phase = nextPhase(task, workflow);
        if (phase) {
           emit(runtimeHooks, { type: 'phase:start', taskId: task.id, phase });
           emit(runtimeHooks, { type: 'phase:stdout', line: `[dry-run] Would run /${phase} on task ${task.id}` });
        }
        return;
      }

      let taskFinished = false;

      while (!taskFinished) {
        const latestState = await loadState(config.stateDir, cwd);
        const latestTask = latestState.tasks.find((entry) => entry.id === task.id);
        if (!latestTask) break;

        const phase = nextPhase(latestTask, workflow);
        if (!phase) {
          latestTask.status = 'done';
          if (latestState.currentTask === latestTask.id) latestState.currentTask = null;
          await saveState(latestState, config.stateDir, cwd);
           emit(runtimeHooks, { type: 'task:done', taskId: latestTask.id });
          taskFinished = true;
          continue;
        }

        if (phase === 'sync') {
            const approved = await awaitGate(config, runtimeHooks, latestTask.id, 'sync', cwd);
          if (!approved) {
            taskFinished = true;
            continue;
          }
        }

         emit(runtimeHooks, { type: 'phase:start', taskId: latestTask.id, phase });

        const memoryContext = memoryDb
          ? await retrieveMemoryContext(memoryDb, latestTask, config)
          : null;
        const memoryBlock = memoryContext ? buildMemoryPromptBlock(memoryContext.block) : undefined;

        let result;
        try {
          result = await runPhase(
             latestTask,
             phase,
             (line) => emit(runtimeHooks, { type: 'phase:stdout', line }),
             config,
             memoryBlock,
           );
        } catch (error) {
          result = {
            status: 'failed' as const,
            stdout: '',
            stderr: error instanceof Error ? error.message : String(error),
            durationMs: 0,
          };
        }

        if (memoryDb && memoryContext !== null) {
          logMemoryRetrieval(memoryDb, latestTask, phase, memoryContext.trace);
          await persistMemoryTrace(config, latestTask, phase, memoryContext.trace, cwd);
        }

         emit(runtimeHooks, {
           type: 'phase:complete',
          taskId: latestTask.id,
          phase,
          status: result.status,
          durationMs: result.durationMs,
        });

        if (result.status !== 'ok') {
           emit(runtimeHooks, {
             type: 'phase:failed',
            taskId: latestTask.id,
            phase,
            reason: failureReason(result.status, result.stderr),
          });
           await setTaskStatus(config, latestTask.id, 'blocked', null, cwd);
          taskFinished = true;
          continue;
        }

        if (memoryDb) {
          await writePhaseMemories(memoryDb, result.stdout, latestTask, phase, config);
        }

        if (phase === 'critic') {
          const freshState = await loadState(config.stateDir, cwd);
          const freshTask = freshState.tasks.find((entry) => entry.id === latestTask.id);
          const route = await routeCriticResult(freshTask ?? latestTask, result.stdout, config);
           await persistCriticRoute(config, latestTask.id, route, cwd);

          if (route === 'blocked') {
             await setTaskStatus(config, latestTask.id, 'blocked', null, cwd);
            taskFinished = true;
            continue;
          }

          continue;
        }

        if (phase === 'frame') {
            const approved = await awaitGate(config, runtimeHooks, latestTask.id, 'frame', cwd);
          if (!approved) {
            taskFinished = true;
          }
        }
      }

      if (opts?.once) return;
    }
  } catch (error) {
    if (error instanceof GatePauseError) {
      throw error;
    }

    // The orchestrator loop must not throw.
  } finally {
    try {
      await eventLogger.close();
    } catch (error) {
      console.error(`[feather] event-log:close-failed reason=${error instanceof Error ? error.message : String(error)}`);
    }
    memoryDb?.close();
  }
}
