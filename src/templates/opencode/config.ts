import type { FeatherConfig } from '../../config/schema.js';

interface OpenCodeAgentDef {
  description: string;
  system: string;
}

interface OpenCodeConfig {
  mcp: Record<string, { type: string; command: string; args: string[] }>;
  agents?: Record<string, OpenCodeAgentDef>;
}

export function renderOpenCodeConfig(config: FeatherConfig): string {
  const cfg: OpenCodeConfig = {
    mcp: {
      featheragents: {
        type: 'local',
        command: 'node',
        args: ['./node_modules/featheragents/dist/server.js'],
      },
    },
  };

  // Agent definitions reference the model assigned to each role
  const buildModel = config.models.find((m) => m.role === 'build');
  const criticModel = config.models.find((m) => m.role === 'critic');
  const syncModel = config.models.find((m) => m.role === 'sync');

  cfg.agents = {
    builder: {
      description: `Build agent (${buildModel?.model ?? 'default'}) — implements tasks`,
      system: 'Use the build skill: read task, implement, commit small, log progress.',
    },
    critic: {
      description: `Critic agent (${criticModel?.model ?? 'default'}) — reviews diffs`,
      system: 'Use the critic skill: read task goal, review diff, record findings.',
    },
    syncer: {
      description: `Sync agent (${syncModel?.model ?? 'default'}) — writes handoffs`,
      system: 'Use the sync skill: read state, write self-contained handoff.',
    },
  };

  return JSON.stringify(cfg, null, 2) + '\n';
}
