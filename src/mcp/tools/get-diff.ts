// No console.log — stdout is the JSON-RPC transport.
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadState, loadConfig, resolveDocsDir } from '../state-io.js';
import { parseFilesFromTaskMd, runGitDiff } from '../../utils/git.js';

export function registerGetDiff(server: McpServer): void {
  server.registerTool(
    'get_diff',
    {
      description:
        'Get the git diff for the current task — scoped to the files listed in the task file. Call this at the start of any critic session instead of running git diff manually.',
      inputSchema: {
        taskId: z
          .string()
          .optional()
          .describe('Task identifier — falls back to currentTask if omitted'),
        base: z
          .string()
          .optional()
          .describe('Git ref to diff against (default: "HEAD"). Use "main" or "HEAD~1" to compare across commits.'),
      },
    },
    async ({ taskId, base = 'HEAD' }) => {
      const config = await loadConfig();
      const state = await loadState(config?.stateDir);
      const cwd = process.cwd();

      const resolvedTaskId = taskId ?? state.currentTask;
      if (!resolvedTaskId) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No task specified and no current task is active. Pass taskId or run start_task first.',
            },
          ],
        };
      }

      // Read the task markdown file to extract files list
      const docsDir = resolveDocsDir(config);
      const mdPath = join(docsDir, 'tasks', `${resolvedTaskId}.md`);
      let taskFiles: string[] = [];

      if (existsSync(mdPath)) {
        const md = await readFile(mdPath, 'utf8');
        taskFiles = parseFilesFromTaskMd(md);
      }

      const { diff, files, scoped } = await runGitDiff(taskFiles, base, cwd);

      const header = scoped
        ? `## Diff for ${resolvedTaskId} (vs ${base})\n\nScoped to task files:\n${files.map((f) => `- ${f}`).join('\n')}`
        : `## Diff for ${resolvedTaskId} (vs ${base})\n\n⚠ No files found in task file — showing full unscoped diff.`;

      const body = diff
        ? `\n\n\`\`\`diff\n${diff}\n\`\`\``
        : '\n\nNo changes found.';

      return {
        content: [{ type: 'text' as const, text: header + body }],
      };
    }
  );
}
