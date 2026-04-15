// No console.log — stdout is the JSON-RPC transport.
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadState, saveState, loadConfig } from '../state-io.js';

export function registerRecordReviewNotes(server: McpServer): void {
  server.registerTool(
    'record_review_notes',
    {
      description: 'Write critic review notes to a task. Call after completing a code review.',
      inputSchema: {
        taskId: z.string().describe('The task identifier'),
        notes: z.string().describe('Review findings — blockers, suggestions, approval status'),
      },
    },
    async ({ taskId, notes }) => {
      const config = await loadConfig();
      const state = await loadState(config?.stateDir);

      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Task ${taskId} not found.`,
            },
          ],
        };
      }

      task.reviewNotes = notes;
      task.progress.push({
        timestamp: new Date().toISOString(),
        role: 'critic',
        message: 'Review notes recorded',
      });

      await saveState(state, config?.stateDir);

      return {
        content: [
          {
            type: 'text' as const,
            text: `Review notes saved for ${taskId}.`,
          },
        ],
      };
    }
  );
}
