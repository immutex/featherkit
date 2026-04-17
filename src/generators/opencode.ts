import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import type { FeatherConfig } from '../config/schema.js';
import { deepMerge } from './claude-code.js';

const CONFIG_PATH = '.opencode/opencode.json';

function buildMcpEntry(): Record<string, unknown> {
  return {
    $schema: 'https://opencode.ai/config.json',
    mcp: {
      featherkit: {
        type: 'local',
        command: ['node', './node_modules/@1mmutex/featherkit/dist/server.js'],
      },
    },
  };
}

export async function generateOpenCodeConfig(cwd: string, _config: FeatherConfig): Promise<void> {
  const configPath = join(cwd, CONFIG_PATH);

  let existing: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      const raw = await readFile(configPath, 'utf8');
      existing = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }

  const merged = deepMerge(existing, buildMcpEntry());

  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
}
