import type { FeatherConfig } from '../config/schema.js';

export function renderFeatherkitConfig(config: FeatherConfig): string {
  return JSON.stringify(config, null, 2) + '\n';
}
