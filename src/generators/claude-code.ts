import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';

const SETTINGS_PATH = '.claude/settings.local.json';

const MCP_ENTRY = {
  mcpServers: {
    featheragents: {
      command: 'node',
      args: ['./node_modules/featheragents/dist/server.js'],
    },
  },
  permissions: {
    allow: ['mcp__featheragents__*'],
  },
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

export async function generateClaudeCodeConfig(cwd: string): Promise<void> {
  const settingsPath = join(cwd, SETTINGS_PATH);

  let existing: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      const raw = await readFile(settingsPath, 'utf8');
      existing = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // Unreadable/invalid JSON — start fresh but don't clobber the file
      existing = {};
    }
  }

  const merged = deepMerge(existing, MCP_ENTRY);

  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
}
