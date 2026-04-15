import type { FeatherConfig, Integrations, ModelConfig } from './schema.js';

export const DEFAULT_STATE_DIR = '.project-state';
export const DEFAULT_DOCS_DIR = 'project-docs';

export const DEFAULT_INTEGRATIONS: Integrations = {
  linear: false,
  github: false,
  context7: false,
  webSearch: false,
};

// Model presets — each covers all four roles
export const MODEL_PRESETS: Record<string, ModelConfig[]> = {
  balanced: [
    { provider: 'anthropic', model: 'claude-sonnet-4-20250514', role: 'frame' },
    { provider: 'anthropic', model: 'claude-sonnet-4-20250514', role: 'build' },
    { provider: 'openai', model: 'o3', role: 'critic' },
    { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', role: 'sync' },
  ],
  'low-cost': [
    { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', role: 'frame' },
    { provider: 'anthropic', model: 'claude-sonnet-4-20250514', role: 'build' },
    { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', role: 'critic' },
    { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', role: 'sync' },
  ],
  'high-quality': [
    { provider: 'anthropic', model: 'claude-opus-4-6', role: 'frame' },
    { provider: 'anthropic', model: 'claude-sonnet-4-20250514', role: 'build' },
    { provider: 'openai', model: 'o3', role: 'critic' },
    { provider: 'anthropic', model: 'claude-sonnet-4-20250514', role: 'sync' },
  ],
  'local-first': [
    { provider: 'ollama', model: 'qwen3:30b', role: 'frame' },
    { provider: 'ollama', model: 'qwen3:30b', role: 'build' },
    { provider: 'ollama', model: 'qwen3:30b', role: 'critic' },
    { provider: 'ollama', model: 'qwen3:8b', role: 'sync' },
  ],
};

export function defaultConfig(projectName: string, preset = 'balanced'): FeatherConfig {
  const models = MODEL_PRESETS[preset] ?? MODEL_PRESETS['balanced']!;
  return {
    version: 1,
    projectName,
    clients: 'both',
    models,
    integrations: { ...DEFAULT_INTEGRATIONS },
    stateDir: DEFAULT_STATE_DIR,
    docsDir: DEFAULT_DOCS_DIR,
  };
}
