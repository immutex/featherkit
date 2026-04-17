import type { FeatherConfig } from '../../config/schema.js';

interface OpenCodeConfig {
  $schema: string;
  mcp: Record<string, { type: string; command: string[] }>;
}

export function renderOpenCodeConfig(_config: FeatherConfig): string {
  const cfg: OpenCodeConfig = {
    $schema: 'https://opencode.ai/config.json',
    mcp: {
      featherkit: {
        type: 'local',
        command: ['node', './node_modules/@1mmutex/featherkit/dist/server.js'],
      },
    },
  };

  return JSON.stringify(cfg, null, 2) + '\n';
}
