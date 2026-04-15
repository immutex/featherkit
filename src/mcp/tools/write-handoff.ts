// No console.log — stdout is the JSON-RPC transport.
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadState, saveState, loadConfig, resolveDocsDir } from '../state-io.js';
import { buildHandoffMd } from '../../utils/handoff.js';
import type { ModelRole } from '../../config/schema.js';

export function registerWriteHandoff(server: McpServer): void {
  server.registerTool(
    'write_handoff',
    {
      description:
        'Write a handoff note between roles. Updates state and latest-handoff.md. Call at the end of any work session.',
      inputSchema: {
        from: z.enum(['frame', 'build', 'critic', 'sync']).describe('Role handing off'),
        to: z.enum(['frame', 'build', 'critic', 'sync']).describe('Role receiving'),
        notes: z
          .string()
          .describe('Self-contained handoff: what was done, what is next, any blockers'),
        taskId: z.string().optional().describe('Associate with a specific task (uses currentTask if omitted)'),
      },
    },
    async ({ from, to, notes, taskId }) => {
      const config = await loadConfig();
      const state = await loadState(config?.stateDir);

      const resolvedTaskId = taskId ?? state.currentTask;
      const timestamp = new Date().toISOString();

      const trimmedNotes = notes.trim();
      const handoff = {
        from: from as ModelRole,
        to: to as ModelRole,
        notes: trimmedNotes,
        timestamp,
      };

      // Write to the task if one is active
      if (resolvedTaskId) {
        const task = state.tasks.find((t) => t.id === resolvedTaskId);
        if (task) {
          task.handoff = handoff;
          task.progress.push({
            timestamp,
            role: from as ModelRole,
            message: `Handoff written to ${to}`,
          });
        }
      }

      await saveState(state, config?.stateDir);

      // Write latest-handoff.md
      const docsDir = resolveDocsDir(config);
      const activeDir = join(docsDir, 'active');
      await mkdir(activeDir, { recursive: true });

      const handoffMd = buildHandoffMd({
        from,
        to,
        timestamp,
        taskId: resolvedTaskId ?? undefined,
        notes: trimmedNotes,
      });

      await writeFile(join(activeDir, 'latest-handoff.md'), handoffMd, 'utf8');

      return {
        content: [
          {
            type: 'text' as const,
            text: `Handoff written: ${from} → ${to}. latest-handoff.md updated.`,
          },
        ],
      };
    }
  );
}
