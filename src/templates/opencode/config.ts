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
        command: ['npx', '-y', '--package', '@1mmutex/featherkit', 'featherkit-mcp'],
      },
    },
  };

  return JSON.stringify(cfg, null, 2) + '\n';
}
