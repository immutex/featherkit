import { Command } from 'commander';
import { loadConfig } from '../config/loader.js';
import { generateClaudeCodeConfig } from '../generators/claude-code.js';
import { generateOpenCodeConfig } from '../generators/opencode.js';
import { log } from '../utils/logger.js';

export async function runMcpInstall(cwd: string): Promise<void> {
  const config = await loadConfig(cwd);

  const includeClaudeCode = config.clients === 'claude-code' || config.clients === 'both';
  const includeOpenCode = config.clients === 'opencode' || config.clients === 'both';

  if (includeClaudeCode) {
    await generateClaudeCodeConfig(cwd, config);
    log.success('.mcp.json + .claude/settings.local.json — featherkit MCP registered');
  }

  if (includeOpenCode) {
    await generateOpenCodeConfig(cwd, config);
    log.success('.opencode/opencode.json — featherkit MCP registered');
  }
}

export const mcpCommand = new Command('mcp');

mcpCommand
  .command('install')
  .description('Register the featherkit MCP server with configured clients')
  .action(async () => {
    try {
      await runMcpInstall(process.cwd());
    } catch (err) {
      log.error(String(err));
      process.exit(1);
    }
  });
