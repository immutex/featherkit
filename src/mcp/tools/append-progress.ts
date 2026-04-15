// No console.log — stdout is the JSON-RPC transport.
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadState, saveState, loadConfig } from '../state-io.js';
import type { ModelRole } from '../../config/schema.js';

export function registerAppendProgress(server: McpServer): void {
  server.registerTool(
    'append_progress',
    {
      description: 'Append a progress note to a task. Call after each significant implementation step.',
      inputSchema: {
        taskId: z.string().describe('The task identifier'),
        role: z
          .enum(['frame', 'build', 'critic', 'sync'])
          .describe('Role logging the progress'),
        message: z.string().describe('Brief description of what was done'),
      },
    },
    async ({ taskId, role, message }) => {
      const config = await loadConfig();
      const state = await loadState(config?.stateDir);

      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Task ${taskId} not found. Call start_task first.`,
            },
          ],
        };
      }

      task.progress.push({
        timestamp: new Date().toISOString(),
        role: role as ModelRole,
        message,
      });

      await saveState(state, config?.stateDir);

      return {
        content: [
          {
            type: 'text' as const,
            text: `Progress logged to ${taskId}: ${message}`,
          },
        ],
      };
    }
  );
}
