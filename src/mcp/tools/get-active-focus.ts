// No console.log — stdout is the JSON-RPC transport.
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadConfig, resolveDocsDir } from '../state-io.js';

export function registerGetActiveFocus(server: McpServer): void {
  server.registerTool(
    'get_active_focus',
    {
      description:
        'Read the current focus file — active task, next up, and blockers. Call this at the start of any work session.',
    },
    async () => {
      const config = await loadConfig();
      const docsDir = resolveDocsDir(config);
      const focusPath = join(docsDir, 'active', 'current-focus.md');

      if (!existsSync(focusPath)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No current-focus.md found. Run `featheragents init` to set up project docs.',
            },
          ],
        };
      }

      const content = await readFile(focusPath, 'utf8');
      return { content: [{ type: 'text' as const, text: content }] };
    }
  );
}
