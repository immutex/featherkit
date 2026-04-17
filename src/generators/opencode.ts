import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import type { FeatherConfig } from '../config/schema.js';
import { deepMerge } from './claude-code.js';

const CONFIG_PATH = '.opencode/opencode.json';

function buildMcpEntry(config: FeatherConfig): Record<string, unknown> {
  const mcp: Record<string, unknown> = {
    featherkit: {
      type: 'local',
      command: ['node', './node_modules/@1mmutex/featherkit/dist/server.js'],
    },
  };

  if (config.integrations.context7) {
    mcp['context7'] = {
      type: 'remote',
      url: 'https://mcp.context7.com/mcp',
    };
  }

  return {
    $schema: 'https://opencode.ai/config.json',
    mcp,
  };
}

export async function generateOpenCodeConfig(cwd: string, config: FeatherConfig): Promise<void> {
  const configPath = join(cwd, CONFIG_PATH);

  let existing: Record<string, unknown> = {};
  try {
    const raw = await readFile(configPath, 'utf8');
    existing = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    existing = {};
  }

  const merged = deepMerge(existing, buildMcpEntry(config));

  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
}
