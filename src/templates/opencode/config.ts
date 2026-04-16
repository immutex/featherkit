import type { FeatherConfig } from '../../config/schema.js';
import { renderBuilderAgent } from './agents/builder.js';
import { renderCriticAgent } from './agents/critic.js';
import { renderSyncerAgent } from './agents/syncer.js';

interface OpenCodeAgentDef {
  description: string;
  model?: string;
  system: string;
}

interface OpenCodeConfig {
  mcp: Record<string, { type: string; command: string; args: string[] }>;
  agents?: Record<string, OpenCodeAgentDef>;
}

export function renderOpenCodeConfig(config: FeatherConfig): string {
  const cfg: OpenCodeConfig = {
    mcp: {
      featherkit: {
        type: 'local',
        command: 'node',
        args: ['./node_modules/@1mmutex/featherkit/dist/server.js'],
      },
    },
  };

  const buildModel = config.models.find((m) => m.role === 'build');
  const criticModel = config.models.find((m) => m.role === 'critic');
  const syncModel = config.models.find((m) => m.role === 'sync');

  cfg.agents = {
    builder: {
      description: 'Build agent — implements tasks',
      ...(buildModel ? { model: `${buildModel.provider}/${buildModel.model}` } : {}),
      system: renderBuilderAgent(config),
    },
    critic: {
      description: 'Critic agent — reviews diffs against done criteria',
      ...(criticModel ? { model: `${criticModel.provider}/${criticModel.model}` } : {}),
      system: renderCriticAgent(config),
    },
    syncer: {
      description: 'Sync agent — writes self-contained handoffs',
      ...(syncModel ? { model: `${syncModel.provider}/${syncModel.model}` } : {}),
      system: renderSyncerAgent(config),
    },
  };

  return JSON.stringify(cfg, null, 2) + '\n';
}
