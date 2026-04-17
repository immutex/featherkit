import type { FeatherConfig, Integrations, ModelConfig } from './schema.js';

export const DEFAULT_STATE_DIR = '.project-state';
export const DEFAULT_DOCS_DIR = 'project-docs';

export const DEFAULT_INTEGRATIONS: Integrations = {
  linear: false,
  github: false,
  context7: false,
  webSearch: false,
};

// Curated catalog of recent, coding-capable models
export interface ModelOption {
  provider: string;
  model: string;
  label: string;
}

export const MODEL_CATALOG: ModelOption[] = [
  // Anthropic
  { provider: 'anthropic', model: 'claude-opus-4-7',          label: 'Claude Opus 4.7 (Anthropic) — frontier flagship' },
  { provider: 'anthropic', model: 'claude-sonnet-4-6',        label: 'Claude Sonnet 4.6 (Anthropic) — balanced performance' },
  { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Anthropic) — fast, low cost' },
  // OpenAI
  { provider: 'openai',    model: 'gpt-5.4',                  label: 'GPT-5.4 (OpenAI) — frontier' },
  { provider: 'openai',    model: 'gpt-5.4-mini',             label: 'GPT-5.4 mini (OpenAI) — fast, lower cost' },
  // Open-source via OpenRouter
  { provider: 'openrouter', model: 'qwen/qwen3.6-plus',       label: 'Qwen3.6 Plus (Alibaba via OpenRouter) — strong coding' },
  { provider: 'openrouter', model: 'z-ai/glm-5.1',            label: 'GLM-5.1 (Zhipu AI via OpenRouter) — open-weight MoE, 58.4 SWE-bench' },
];

// Model presets — each covers all four roles
export const MODEL_PRESETS: Record<string, ModelConfig[]> = {
  balanced: [
    { provider: 'anthropic', model: 'claude-sonnet-4-6',         role: 'frame' },
    { provider: 'anthropic', model: 'claude-sonnet-4-6',         role: 'build' },
    { provider: 'openai',    model: 'gpt-5.4',                   role: 'critic' },
    { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', role: 'sync' },
  ],
  'low-cost': [
    { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', role: 'frame' },
    { provider: 'anthropic', model: 'claude-sonnet-4-6',         role: 'build' },
    { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', role: 'critic' },
    { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', role: 'sync' },
  ],
  'high-quality': [
    { provider: 'anthropic', model: 'claude-opus-4-7',           role: 'frame' },
    { provider: 'anthropic', model: 'claude-sonnet-4-6',         role: 'build' },
    { provider: 'openai',    model: 'gpt-5.4',                   role: 'critic' },
    { provider: 'anthropic', model: 'claude-sonnet-4-6',         role: 'sync' },
  ],
  'open-source': [
    { provider: 'openrouter', model: 'qwen/qwen3.6-plus', role: 'frame' },
    { provider: 'openrouter', model: 'qwen/qwen3.6-plus', role: 'build' },
    { provider: 'openrouter', model: 'z-ai/glm-5.1',      role: 'critic' },
    { provider: 'openrouter', model: 'qwen/qwen3.6-plus', role: 'sync' },
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
