// No console.log — stdout is the JSON-RPC transport.
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadState, saveState, loadConfig } from '../state-io.js';
import type { ModelRole } from '../../config/schema.js';

export function registerStartTask(server: McpServer): void {
  server.registerTool(
    'start_task',
    {
      description: 'Register or activate a task. Sets it as the current task in state.',
      inputSchema: {
        taskId: z.string().describe('The task identifier (e.g. FEAT-001)'),
        title: z.string().optional().describe('Short task title'),
        role: z
          .enum(['frame', 'build', 'critic', 'sync'])
          .optional()
          .describe('Role being assigned to this task'),
      },
    },
    async ({ taskId, title, role }) => {
      const config = await loadConfig();
      const state = await loadState(config?.stateDir);

      const existing = state.tasks.find((t) => t.id === taskId);

      if (existing) {
        existing.status = 'active';
        if (role) existing.assignedRole = role as ModelRole;
        if (title) existing.title = title;
      } else {
        state.tasks.push({
          id: taskId,
          title: title ?? taskId,
          status: 'active',
          assignedRole: role as ModelRole | undefined,
          progress: [],
        });
      }

      state.currentTask = taskId;
      await saveState(state, config?.stateDir);

      // Dependency check — advisory warning, not a hard block
      const task = state.tasks.find((t) => t.id === taskId);
      const depWarnings: string[] = [];
      if (task?.dependsOn && task.dependsOn.length > 0) {
        for (const depId of task.dependsOn) {
          const dep = state.tasks.find((t) => t.id === depId);
          const depStatus = dep?.status ?? 'not found';
          if (depStatus !== 'done') {
            depWarnings.push(`  - ${depId} (${depStatus})`);
          }
        }
      }

      const warningBlock =
        depWarnings.length > 0
          ? `\n\n⚠ Warning: this task depends on tasks that are not yet done:\n${depWarnings.join('\n')}`
          : '';

      return {
        content: [
          {
            type: 'text' as const,
            text: `Task ${taskId} is now active.${role ? ` Assigned role: ${role}.` : ''}${warningBlock}`,
          },
        ],
      };
    }
  );
}
