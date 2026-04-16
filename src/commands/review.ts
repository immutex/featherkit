import { Command } from 'commander';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { loadConfig } from '../config/loader.js';
import { loadState, resolveDocsDir } from '../mcp/state-io.js';
import { log } from '../utils/logger.js';

export async function runReviewPrepare(cwd: string): Promise<string> {
  const config = await loadConfig(cwd);
  const state = await loadState(config.stateDir, cwd);

  if (!state.currentTask) {
    log.warn('No active task. Run `featherkit task start <id>` first.');
    return '';
  }

  const task = state.tasks.find((t) => t.id === state.currentTask);
  if (!task) {
    log.warn(`Task ${state.currentTask} not found in state.`);
    return '';
  }

  // Build checklist from done criteria in task markdown (if present) and progress
  const docsDir = resolveDocsDir(config, cwd);
  const taskFile = join(docsDir, 'tasks', `${task.id}.md`);

  let taskMd = '';
  if (existsSync(taskFile)) {
    taskMd = await readFile(taskFile, 'utf8');
  }

  const progressLines = task.progress
    .map((p) => `- [${p.role}] ${p.message} _(${p.timestamp.split('T')[0]})_`)
    .join('\n');

  const checklist = `# Review Checklist — ${task.id}

**Task:** ${task.title}
**Status:** ${task.status}

## Progress Log
${progressLines || '_No progress entries yet._'}

## Review Checks
- [ ] All done criteria from the task file are met
- [ ] No regressions in related functionality
- [ ] Tests written and passing for non-trivial logic
- [ ] Code follows project conventions
- [ ] Edge cases handled
${task.reviewNotes ? `\n## Existing Review Notes\n${task.reviewNotes}` : ''}`;

  // Append/replace review section in current-focus.md
  const focusPath = join(docsDir, 'active', 'current-focus.md');
  await mkdir(join(docsDir, 'active'), { recursive: true });

  let focusContent = existsSync(focusPath)
    ? await readFile(focusPath, 'utf8')
    : `# Current Focus\n\n**Project:** ${config.projectName}\n`;

  // Replace or append the review section
  const reviewHeader = '# Review Checklist';
  const reviewIdx = focusContent.indexOf(reviewHeader);
  if (reviewIdx !== -1) {
    focusContent = focusContent.slice(0, reviewIdx) + checklist;
  } else {
    focusContent = focusContent.trimEnd() + '\n\n' + checklist;
  }

  await writeFile(focusPath, focusContent, 'utf8');

  log.blank();
  log.bold(`Review checklist for ${task.id}:\n`);
  console.log(checklist);
  log.blank();
  log.dim(`Also written to ${config.docsDir}/active/current-focus.md`);

  return checklist;
}

export const reviewCommand = new Command('review').description('Review commands');

reviewCommand
  .command('prepare')
  .description('Generate a review checklist for the current task')
  .action(async () => {
    try {
      await runReviewPrepare(process.cwd());
    } catch (err) {
      log.error(String(err));
      process.exit(1);
    }
  });
