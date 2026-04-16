// No console.log — stdout is the JSON-RPC transport.
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadState, loadConfig } from '../state-io.js';

export function registerListTasks(server: McpServer): void {
  server.registerTool(
    'list_tasks',
    {
      description: 'List all tasks and their current status.',
      inputSchema: {
        status: z
          .enum(['pending', 'active', 'blocked', 'done'])
          .optional()
          .describe('Filter by status (omit to list all)'),
      },
    },
    async ({ status }) => {
      const config = await loadConfig();
      const state = await loadState(config?.stateDir);

      const tasks = status ? state.tasks.filter((t) => t.status === status) : state.tasks;

      if (tasks.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: status ? `No tasks with status: ${status}` : 'No tasks found.',
            },
          ],
        };
      }

      const lines = tasks.map((t) => {
        const current = t.id === state.currentTask ? ' ← current' : '';
        const role = t.assignedRole ? ` [${t.assignedRole}]` : '';
        const deps =
          t.dependsOn && t.dependsOn.length > 0
            ? ` [blocked-by: ${t.dependsOn.join(', ')}]`
            : '';
        return `- **${t.id}** (${t.status})${role}${deps}: ${t.title}${current}`;
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: `## Tasks\n\n${lines.join('\n')}`,
          },
        ],
      };
    }
  );
}
