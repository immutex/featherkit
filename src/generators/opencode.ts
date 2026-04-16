import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import type { FeatherConfig } from '../config/schema.js';
import { renderBuilderAgent } from '../templates/opencode/agents/builder.js';
import { renderCriticAgent } from '../templates/opencode/agents/critic.js';
import { renderSyncerAgent } from '../templates/opencode/agents/syncer.js';
import { deepMerge } from './claude-code.js';

const CONFIG_PATH = '.opencode/opencode.json';

function buildMcpEntry(): Record<string, unknown> {
  return {
    mcp: {
      featherkit: {
        type: 'local',
        command: 'node',
        args: ['./node_modules/featherkit/dist/server.js'],
      },
    },
  };
}

function buildAgentEntry(config: FeatherConfig): Record<string, unknown> {
  const buildModel = config.models.find((m) => m.role === 'build');
  const criticModel = config.models.find((m) => m.role === 'critic');
  const syncModel = config.models.find((m) => m.role === 'sync');

  return {
    agents: {
      builder: {
        description: `Build agent (${buildModel?.model ?? 'default'}) — implements tasks`,
        system: renderBuilderAgent(config),
      },
      critic: {
        description: `Critic agent (${criticModel?.model ?? 'default'}) — reviews diffs`,
        system: renderCriticAgent(config),
      },
      syncer: {
        description: `Sync agent (${syncModel?.model ?? 'default'}) — writes handoffs`,
        system: renderSyncerAgent(config),
      },
    },
  };
}

export async function generateOpenCodeConfig(cwd: string, config: FeatherConfig): Promise<void> {
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

  const incoming = deepMerge(buildMcpEntry(), buildAgentEntry(config));
  const merged = deepMerge(existing, incoming);

  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
}
