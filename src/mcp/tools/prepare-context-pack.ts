// No console.log — stdout is the JSON-RPC transport.
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadState, loadConfig, resolveDocsDir } from '../state-io.js';
import {
  parseFilesFromTaskMd,
  parseSectionFromTaskMd,
  runGitDiff,
} from '../../utils/git.js';

const CONVENTIONS_SNIPPET_LINES = 50;

async function readFileIfExists(path: string): Promise<string | null> {
  if (!existsSync(path)) return null;
  return readFile(path, 'utf8');
}

function conventionsSnippet(text: string): string {
  const lines = text.split('\n');
  if (lines.length <= CONVENTIONS_SNIPPET_LINES) return text;
  return lines.slice(0, CONVENTIONS_SNIPPET_LINES).join('\n') + '\n\n...(truncated — read full file if needed)';
}

export function registerPrepareContextPack(server: McpServer): void {
  server.registerTool(
    'prepare_context_pack',
    {
      description:
        'Assemble a minimal, role-specific context bundle for the next work session. Returns a single document with exactly what the specified role needs — no more. Replaces calling get_task + get_diff + get_active_focus separately.',
      inputSchema: {
        forRole: z
          .enum(['frame', 'build', 'critic', 'sync'])
          .describe('The role that will receive this context pack'),
        taskId: z
          .string()
          .optional()
          .describe('Task identifier — falls back to currentTask if omitted'),
        writeToDisk: z
          .boolean()
          .optional()
          .describe('If true, also write the pack to project-docs/active/pack.md (default: false)'),
      },
    },
    async ({ forRole, taskId, writeToDisk = false }) => {
      const config = await loadConfig();
      const state = await loadState(config?.stateDir);
      const cwd = process.cwd();
      const docsDir = resolveDocsDir(config);

      const resolvedTaskId = taskId ?? state.currentTask;
      const task = resolvedTaskId ? state.tasks.find((t) => t.id === resolvedTaskId) : null;

      const sections: string[] = [];
      sections.push(`# Context Pack — ${forRole} role${resolvedTaskId ? ` / ${resolvedTaskId}` : ''}`);
      sections.push(`_Generated at ${new Date().toISOString()}_`);

      // Read task markdown if we have a task ID
      let taskMd: string | null = null;
      if (resolvedTaskId) {
        taskMd = await readFileIfExists(join(docsDir, 'tasks', `${resolvedTaskId}.md`));
      }

      // ── frame pack ──────────────────────────────────────────────────────────
      if (forRole === 'frame') {
        // project brief + active focus
        const overviewPath = join(docsDir, 'context', 'product-overview.md');
        const archPath = join(docsDir, 'context', 'architecture.md');
        const brief = await readFileIfExists(overviewPath) ?? await readFileIfExists(archPath);
        if (brief) sections.push(`## Project Brief\n\n${brief}`);

        const focus = await readFileIfExists(join(docsDir, 'active', 'current-focus.md'));
        if (focus) sections.push(`## Active Focus\n\n${focus}`);

        const conventions = await readFileIfExists(join(docsDir, 'context', 'conventions.md'));
        if (conventions) sections.push(`## Conventions (excerpt)\n\n${conventionsSnippet(conventions)}`);
      }

      // ── build pack ──────────────────────────────────────────────────────────
      if (forRole === 'build') {
        if (taskMd) {
          const goal = parseSectionFromTaskMd(taskMd, 'Goal');
          const files = parseSectionFromTaskMd(taskMd, 'Files');
          const constraints = parseSectionFromTaskMd(taskMd, 'Constraints');
          const done = parseSectionFromTaskMd(taskMd, 'Done Criteria');
          if (goal) sections.push(`## Task Goal\n\n${goal}`);
          if (files) sections.push(`## Files to Work On\n\n${files}`);
          if (constraints) sections.push(`## Constraints\n\n${constraints}`);
          if (done) sections.push(`## Done Criteria\n\n${done}`);
        }

        if (task?.handoff) {
          sections.push(
            `## Latest Handoff (${task.handoff.from} → ${task.handoff.to})\n\n${task.handoff.notes}`
          );
        }

        const conventions = await readFileIfExists(join(docsDir, 'context', 'conventions.md'));
        if (conventions) sections.push(`## Conventions (excerpt)\n\n${conventionsSnippet(conventions)}`);
      }

      // ── critic pack ─────────────────────────────────────────────────────────
      if (forRole === 'critic') {
        if (taskMd) {
          const goal = parseSectionFromTaskMd(taskMd, 'Goal');
          const done = parseSectionFromTaskMd(taskMd, 'Done Criteria');
          if (goal) sections.push(`## Task Goal\n\n${goal}`);
          if (done) sections.push(`## Done Criteria\n\n${done}`);
        }

        // Git diff scoped to task files
        const taskFiles = taskMd ? parseFilesFromTaskMd(taskMd) : [];
        const { diff, files, scoped } = await runGitDiff(taskFiles, 'HEAD', cwd);
        const diffHeader = scoped
          ? `Scoped to: ${files.join(', ')}`
          : '⚠ No files list found — showing full diff';
        sections.push(
          `## Diff (HEAD)\n\n${diffHeader}\n\n\`\`\`diff\n${diff || '(no changes)'}\n\`\`\``
        );

        // Progress summary (last 5 entries)
        if (task && task.progress.length > 0) {
          const recent = task.progress.slice(-5);
          const lines = recent.map((p) => `- [${p.role}] ${p.message}`).join('\n');
          sections.push(`## Recent Progress\n\n${lines}`);
        }

        if (task?.reviewNotes) {
          sections.push(`## Prior Review Notes\n\n${task.reviewNotes}`);
        }
      }

      // ── sync pack ───────────────────────────────────────────────────────────
      if (forRole === 'sync') {
        if (taskMd) {
          const goal = parseSectionFromTaskMd(taskMd, 'Goal');
          if (goal) sections.push(`## Task Goal\n\n${goal}`);
        }

        if (task?.handoff) {
          sections.push(
            `## Latest Handoff (${task.handoff.from} → ${task.handoff.to})\n\n${task.handoff.notes}`
          );
        }

        if (task && task.progress.length > 0) {
          const recent = task.progress.slice(-5);
          const lines = recent.map((p) => `- [${p.role}] ${p.message}`).join('\n');
          sections.push(`## Recent Progress\n\n${lines}`);
        }

        if (task?.reviewNotes) {
          sections.push(`## Review Notes\n\n${task.reviewNotes}`);
        }
      }

      const packContent = sections.join('\n\n---\n\n');

      let diskNote = '';
      if (writeToDisk) {
        const activeDir = join(docsDir, 'active');
        await mkdir(activeDir, { recursive: true });
        const packPath = join(activeDir, 'pack.md');
        await writeFile(packPath, packContent, 'utf8');
        diskNote = `\n\n_Written to ${docsDir}/active/pack.md_`;
      }

      return {
        content: [{ type: 'text' as const, text: packContent + diskNote }],
      };
    }
  );
}
