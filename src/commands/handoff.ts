import { Command } from 'commander';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { select, editor } from '@inquirer/prompts';
import { loadConfig } from '../config/loader.js';
import { loadState, saveState, resolveDocsDir } from '../mcp/state-io.js';
import { log } from '../utils/logger.js';
import { buildHandoffMd } from '../utils/handoff.js';
import type { ModelRole } from '../config/schema.js';

export interface HandoffOptions {
  from?: string;
  to?: string;
  notes?: string;
  taskId?: string;
}

export async function runHandoffWrite(options: HandoffOptions, cwd: string): Promise<void> {
  const config = await loadConfig(cwd);
  const state = await loadState(config.stateDir, cwd);

  const roles = ['frame', 'build', 'critic', 'sync'] as const;

  // Resolve from/to — prompt if not provided
  let from = options.from as ModelRole | undefined;
  let to = options.to as ModelRole | undefined;
  let notes = options.notes;

  if (!from) {
    from = await select<ModelRole>({
      message: 'Handing off from:',
      choices: roles.map((r) => ({ name: r, value: r })),
    });
  }

  if (!to) {
    to = await select<ModelRole>({
      message: 'Handing off to:',
      choices: roles.map((r) => ({ name: r, value: r })),
    });
  }

  if (!notes) {
    notes = await editor({
      message: 'Handoff notes (what was done, what is next, any blockers):',
      default: `## What was done\n\n## What is next\n\n## Blockers\n`,
    });
  }

  const timestamp = new Date().toISOString();
  const resolvedTaskId = options.taskId ?? state.currentTask;

  const trimmedNotes = notes.trim();
  const handoff = { from, to, notes: trimmedNotes, timestamp };

  // Update state
  if (resolvedTaskId) {
    const task = state.tasks.find((t) => t.id === resolvedTaskId);
    if (task) {
      task.handoff = handoff;
      task.progress.push({ timestamp, role: from, message: `Handoff written to ${to}` });
    }
  }

  await saveState(state, config.stateDir, cwd);

  // Write latest-handoff.md
  const docsDir = resolveDocsDir(config, cwd);
  const activeDir = join(docsDir, 'active');
  await mkdir(activeDir, { recursive: true });

  const handoffMd = buildHandoffMd({ from, to, timestamp, taskId: resolvedTaskId ?? undefined, notes: trimmedNotes });

  await writeFile(join(activeDir, 'latest-handoff.md'), handoffMd, 'utf8');

  log.blank();
  log.success(`Handoff written: ${from} → ${to}`);
  log.dim(`Saved to ${config.docsDir}/active/latest-handoff.md`);
}

export const handoffCommand = new Command('handoff').description('Handoff commands');

handoffCommand
  .command('write')
  .description('Write a handoff note between roles')
  .option('--from <role>', 'Role handing off (frame|build|critic|sync)')
  .option('--to <role>', 'Role receiving (frame|build|critic|sync)')
  .option('--notes <text>', 'Handoff notes (non-interactive)')
  .option('--task <id>', 'Associate with a specific task ID')
  .action(async (options: { from?: string; to?: string; notes?: string; task?: string }) => {
    try {
      await runHandoffWrite({ ...options, taskId: options.task }, process.cwd());
    } catch (err) {
      if ((err as NodeJS.ErrnoException).name === 'ExitPromptError') {
        log.info('Cancelled.');
        process.exit(0);
      }
      log.error(String(err));
      process.exit(1);
    }
  });
