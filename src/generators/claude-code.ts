import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import type { FeatherConfig } from '../config/schema.js';

// Project-level MCP server config (read by `claude mcp list` and active sessions)
const MCP_JSON_PATH = '.mcp.json';
// Claude Code settings (permissions, etc.)
const SETTINGS_PATH = '.claude/settings.local.json';

const FEATHERKIT_MCP_ENTRY = {
  command: 'node',
  args: ['./node_modules/@1mmutex/featherkit/dist/server.js'],
};

const CONTEXT7_MCP_ENTRY = {
  command: 'npx',
  args: ['-y', '@upstash/context7-mcp@latest'],
};

/**
 * Recursively deep-merge `source` into `target`.
 * Objects are merged key-by-key; arrays and primitives replace.
 */
export function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const [key, value] of Object.entries(source)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}

export async function generateClaudeCodeConfig(cwd: string, config?: FeatherConfig): Promise<void> {
  const mcpServers: Record<string, unknown> = { featherkit: FEATHERKIT_MCP_ENTRY };
  const allow = ['mcp__featherkit__*'];

  if (config?.integrations.context7) {
    mcpServers['context7'] = CONTEXT7_MCP_ENTRY;
    allow.push('mcp__context7__*');
  }

  // Write MCP servers to .mcp.json (project root — picked up by claude mcp list and sessions)
  const mcpJsonPath = join(cwd, MCP_JSON_PATH);
  let existingMcp: Record<string, unknown> = {};
  try {
    const raw = await readFile(mcpJsonPath, 'utf8');
    existingMcp = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    existingMcp = {};
  }
  const mergedMcp = deepMerge(existingMcp, { mcpServers });
  await writeFile(mcpJsonPath, JSON.stringify(mergedMcp, null, 2) + '\n', 'utf8');

  // Write permissions to .claude/settings.local.json
  const settingsPath = join(cwd, SETTINGS_PATH);
  let existingSettings: Record<string, unknown> = {};
  try {
    const raw = await readFile(settingsPath, 'utf8');
    existingSettings = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    existingSettings = {};
  }
  const mergedSettings = deepMerge(existingSettings, { permissions: { allow } });
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(mergedSettings, null, 2) + '\n', 'utf8');
}
