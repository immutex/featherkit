// MCP server entry point — spawned by clients as a stdio child process.
// CRITICAL: Do NOT use console.log here or in any imported MCP module.
// stdout is the JSON-RPC transport. Use console.error for logs only.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAllTools } from './tools/index.js';

const server = new McpServer({
  name: 'featheragents',
  version: '0.1.0',
});

registerAllTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[featheragents] MCP server started');
}

main().catch((err) => {
  console.error('[featheragents] Fatal error:', err);
  process.exit(1);
});
