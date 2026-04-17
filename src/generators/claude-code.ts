import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import type { FeatherConfig } from '../config/schema.js';

const SETTINGS_PATH = '.claude/settings.local.json';

const FEATHERKIT_MCP_ENTRY = {
  command: 'npx',
  args: ['-y', '--package', '@1mmutex/featherkit', 'featherkit-mcp'],
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
  const settingsPath = join(cwd, SETTINGS_PATH);

  let existing: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      const raw = await readFile(settingsPath, 'utf8');
      existing = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }

  const mcpServers: Record<string, unknown> = {
    featherkit: FEATHERKIT_MCP_ENTRY,
  };

  if (config?.integrations.context7) {
    mcpServers['context7'] = CONTEXT7_MCP_ENTRY;
  }

  const incoming: Record<string, unknown> = {
    mcpServers,
    permissions: {
      allow: ['mcp__featherkit__*'],
    },
  };

  if (config?.integrations.context7) {
    (incoming.permissions as Record<string, unknown>)['allow'] = [
      'mcp__featherkit__*',
      'mcp__context7__*',
    ];
  }

  const merged = deepMerge(existing, incoming);

  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
}
