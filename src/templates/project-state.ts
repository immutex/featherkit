import type { FeatherConfig } from '../config/schema.js';
import type { ProjectState } from '../config/schema.js';

export function renderProjectState(_config: FeatherConfig): string {
  const state: ProjectState = {
    version: 1,
    currentTask: null,
    tasks: [],
    lastUpdated: new Date().toISOString(),
  };
  return JSON.stringify(state, null, 2) + '\n';
}
