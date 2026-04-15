// No console.log — stdout is the JSON-RPC transport.
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadConfig, resolveDocsDir } from '../state-io.js';

export function registerRecordDecision(server: McpServer): void {
  server.registerTool(
    'record_decision',
    {
      description:
        'Record an architectural or design decision. Appends to project-docs/decisions/.',
      inputSchema: {
        title: z.string().describe('Short decision title'),
        body: z.string().describe('Decision context, options considered, and rationale'),
        status: z
          .enum(['accepted', 'proposed', 'deprecated', 'superseded'])
          .optional()
          .describe('Decision status (default: accepted)'),
      },
    },
    async ({ title, body, status = 'accepted' }) => {
      const config = await loadConfig();
      const docsDir = resolveDocsDir(config);
      const decisionsDir = join(docsDir, 'decisions');
      await mkdir(decisionsDir, { recursive: true });

      const timestamp = new Date().toISOString();
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const datePrefix = timestamp.split('T')[0];
      const filename = `${datePrefix}-${slug}.md`;

      const content = `# ${title}

**Status:** ${status}
**Date:** ${datePrefix}

## Context

${body}
`;

      await writeFile(join(decisionsDir, filename), content, 'utf8');

      return {
        content: [
          {
            type: 'text' as const,
            text: `Decision recorded: ${filename}`,
          },
        ],
      };
    }
  );
}
