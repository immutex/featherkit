// No console.log — stdout is the JSON-RPC transport.
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadState, loadConfig, resolveDocsDir } from '../state-io.js';

export function registerGetTask(server: McpServer): void {
  server.registerTool(
    'get_task',
    {
      description:
        'Get task details from state and the task markdown file. Call this before starting build or critic work.',
      inputSchema: {
        taskId: z.string().describe('The task identifier (e.g. FEAT-001)'),
      },
    },
    async ({ taskId }) => {
      const config = await loadConfig();
      const state = await loadState(config?.stateDir);
      const task = state.tasks.find((t) => t.id === taskId);

      const parts: string[] = [];

      if (task) {
        parts.push(
          `## State\n\`\`\`json\n${JSON.stringify(task, null, 2)}\n\`\`\``
        );
      } else {
        parts.push(`Task ${taskId} not found in state.`);
      }

      // Also read the markdown file if it exists
      const docsDir = resolveDocsDir(config);
      const mdPath = join(docsDir, 'tasks', `${taskId}.md`);
      if (existsSync(mdPath)) {
        const md = await readFile(mdPath, 'utf8');
        parts.push(`## Task File\n\n${md}`);
      }

      return {
        content: [{ type: 'text' as const, text: parts.join('\n\n') }],
      };
    }
  );
}
