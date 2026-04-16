import { Command } from 'commander';
import { join } from 'path';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { loadConfig } from '../config/loader.js';
import { loadState, saveState, resolveDocsDir } from '../mcp/state-io.js';
import { renderTaskTemplate } from '../templates/index.js';
import { log } from '../utils/logger.js';

// ── task start ────────────────────────────────────────────────────────────────

export async function runTaskStart(
  taskId: string,
  options: { title?: string; role?: string },
  cwd: string
): Promise<void> {
  const config = await loadConfig(cwd);
  const state = await loadState(config.stateDir, cwd);

  const existing = state.tasks.find((t) => t.id === taskId);
  if (existing) {
    existing.status = 'active';
    if (options.title) existing.title = options.title;
  } else {
    state.tasks.push({
      id: taskId,
      title: options.title ?? taskId,
      status: 'active',
      progress: [],
    });
  }
  state.currentTask = taskId;
  await saveState(state, config.stateDir, cwd);

  // Create task markdown file from template if it doesn't exist
  const docsDir = resolveDocsDir(config, cwd);
  const tasksDir = join(docsDir, 'tasks');
  const taskFile = join(tasksDir, `${taskId}.md`);
  if (!existsSync(taskFile)) {
    await mkdir(tasksDir, { recursive: true });
    await writeFile(taskFile, renderTaskTemplate(config, taskId, options.title), 'utf8');
    log.success(`Created ${config.docsDir}/tasks/${taskId}.md`);
  } else {
    log.dim(`Task file already exists: ${config.docsDir}/tasks/${taskId}.md`);
  }

  log.blank();
  log.bold(`Task: ${taskId}`);
  log.info(`Status: active`);
  log.info(`Title:  ${options.title ?? existing?.title ?? taskId}`);
  log.info(`Edit:   ${config.docsDir}/tasks/${taskId}.md`);
}

// ── task sync ─────────────────────────────────────────────────────────────────

export async function runTaskSync(cwd: string): Promise<void> {
  const config = await loadConfig(cwd);
  const state = await loadState(config.stateDir, cwd);

  log.blank();
  log.bold('Project state\n');

  if (!state.currentTask) {
    log.dim('No active task. Run `featheragents task start <id>`.');
    log.blank();
    return;
  }

  const task = state.tasks.find((t) => t.id === state.currentTask);

  log.info(`Current task:  ${state.currentTask}`);
  if (task) {
    log.info(`Title:         ${task.title}`);
    log.info(`Status:        ${task.status}`);
    log.info(`Progress:      ${task.progress.length} entr${task.progress.length === 1 ? 'y' : 'ies'}`);
    if (task.assignedRole) log.info(`Role:          ${task.assignedRole}`);
    if (task.handoff) {
      log.info(`Last handoff:  ${task.handoff.from} → ${task.handoff.to} (${task.handoff.timestamp.split('T')[0]})`);
    }
    if (task.reviewNotes) {
      log.info(`Review notes:  present`);
    }
  }

  log.blank();
  log.dim(`All tasks: ${state.tasks.length} total`);
  for (const t of state.tasks) {
    const marker = t.id === state.currentTask ? '→' : ' ';
    log.dim(`  ${marker} ${t.id} (${t.status}): ${t.title}`);
  }

  const enabledIntegrations = Object.entries(config.integrations)
    .filter(([, v]) => v)
    .map(([k]) => k);
  if (enabledIntegrations.length > 0) {
    log.blank();
    log.dim(`Integrations: ${enabledIntegrations.join(', ')} (sync not yet implemented)`);
  }

  log.blank();
}

// ── task log ──────────────────────────────────────────────────────────────────

export async function runTaskLog(taskId: string, cwd: string): Promise<void> {
  const config = await loadConfig(cwd);
  const state = await loadState(config.stateDir, cwd);

  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) {
    const ids = state.tasks.map((t) => t.id).join(', ') || 'none';
    log.error(`Task "${taskId}" not found. Available: ${ids}`);
    process.exit(1);
  }

  log.blank();
  log.bold(`Task: ${task.id} — ${task.title}`);
  log.info(`Status: ${task.status}`);
  if (task.assignedRole) log.info(`Role: ${task.assignedRole}`);
  log.blank();

  // Progress timeline
  if (task.progress.length > 0) {
    const sorted = [...task.progress].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp)
    );
    for (const entry of sorted) {
      const date = entry.timestamp.slice(0, 16).replace('T', ' ');
      log.dim(`${date} [${entry.role.padEnd(6)}]  ${entry.message}`);
    }
  } else {
    log.dim('(no progress entries)');
  }

  // Handoff block
  if (task.handoff) {
    log.blank();
    log.bold(`Handoff: ${task.handoff.from} → ${task.handoff.to}  (${task.handoff.timestamp.slice(0, 10)})`);
    for (const line of task.handoff.notes.split('\n')) {
      log.info(`  ${line}`);
    }
  }

  // Review notes block
  if (task.reviewNotes) {
    log.blank();
    log.bold('Review Notes:');
    for (const line of task.reviewNotes.split('\n')) {
      log.info(`  ${line}`);
    }
  }

  log.blank();
}

// ── Commander commands ────────────────────────────────────────────────────────

export const taskCommand = new Command('task').description('Task management commands');

taskCommand
  .command('start <id>')
  .description('Create or activate a task')
  .option('--title <title>', 'Task title')
  .action(async (id: string, options: { title?: string }) => {
    try {
      await runTaskStart(id, options, process.cwd());
    } catch (err) {
      log.error(String(err));
      process.exit(1);
    }
  });

taskCommand
  .command('sync')
  .description('Show current task status and project state')
  .action(async () => {
    try {
      await runTaskSync(process.cwd());
    } catch (err) {
      log.error(String(err));
      process.exit(1);
    }
  });

taskCommand
  .command('log <id>')
  .description('Show the full timeline of a task — progress, handoff, review notes')
  .action(async (id: string) => {
    try {
      await runTaskLog(id, process.cwd());
    } catch (err) {
      log.error(String(err));
      process.exit(1);
    }
  });
