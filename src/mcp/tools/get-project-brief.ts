// No console.log — stdout is the JSON-RPC transport.
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadConfig, resolveDocsDir } from '../state-io.js';

export function registerGetProjectBrief(server: McpServer): void {
  server.registerTool(
    'get_project_brief',
    {
      description:
        'Read the project brief and architecture overview. Call this at the start of any Frame session.',
    },
    async () => {
      const config = await loadConfig();
      const docsDir = resolveDocsDir(config);

      const candidates = [
        join(docsDir, 'context', 'product-overview.md'),
        join(docsDir, 'context', 'architecture.md'),
      ];

      const parts: string[] = [];

      for (const candidate of candidates) {
        if (existsSync(candidate)) {
          const content = await readFile(candidate, 'utf8');
          parts.push(`## ${candidate.split('/').pop()}\n\n${content}`);
        }
      }

      if (parts.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No project brief found. Create project-docs/context/architecture.md to get started.',
            },
          ],
        };
      }

      return {
        content: [{ type: 'text' as const, text: parts.join('\n\n---\n\n') }],
      };
    }
  );
}
