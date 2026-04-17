import type { FeatherConfig } from '../config/schema.js';
import { renderClaudeMd } from './claude-md.js';
import { renderFrameSkill } from './skills/frame.js';
import { renderBuildSkill } from './skills/build.js';
import { renderCriticSkill } from './skills/critic.js';
import { renderSyncSkill } from './skills/sync.js';
import { renderOpenCodeConfig } from './opencode/config.js';
import { renderBuilderAgent } from './opencode/agents/builder.js';
import { renderCriticAgent } from './opencode/agents/critic.js';
import { renderSyncerAgent } from './opencode/agents/syncer.js';
import { renderProjectState } from './project-state.js';
import { renderProjectDocs } from './project-docs.js';
import { renderFeatherkitConfig } from './featherkit-config.js';

export interface TemplateFile {
  relativePath: string;
  content: string;
  /** If true, always overwrite on init — file is generated and should stay current. */
  managed?: boolean;
}

export function getAllTemplates(config: FeatherConfig): TemplateFile[] {
  const files: TemplateFile[] = [];
  const includeClaudeCode = config.clients === 'claude-code' || config.clients === 'both';
  const includeOpenCode = config.clients === 'opencode' || config.clients === 'both';

  // Claude Code files — skills are managed (always overwritten with latest generated content)
  if (includeClaudeCode) {
    files.push({ relativePath: '.claude/CLAUDE.md', content: renderClaudeMd(config), managed: true });
    files.push({ relativePath: '.claude/commands/frame.md', content: renderFrameSkill(config), managed: true });
    files.push({ relativePath: '.claude/commands/build.md', content: renderBuildSkill(config), managed: true });
    files.push({ relativePath: '.claude/commands/critic.md', content: renderCriticSkill(config), managed: true });
    files.push({ relativePath: '.claude/commands/sync.md', content: renderSyncSkill(config), managed: true });
  }

  // OpenCode files — agents are managed; opencode.json is handled by the generator (deep merge)
  if (includeOpenCode) {
    files.push({ relativePath: '.opencode/opencode.json', content: renderOpenCodeConfig(config) });
    files.push({ relativePath: '.opencode/agents/builder.md', content: renderBuilderAgent(config), managed: true });
    files.push({ relativePath: '.opencode/agents/critic.md', content: renderCriticAgent(config), managed: true });
    files.push({ relativePath: '.opencode/agents/syncer.md', content: renderSyncerAgent(config), managed: true });
  }

  // Always included
  files.push({
    relativePath: `${config.stateDir}/state.json`,
    content: renderProjectState(config),
  });

  files.push({
    relativePath: 'featherkit/config.json',
    content: renderFeatherkitConfig(config),
  });

  // Project docs (returns multiple files)
  const docFiles = renderProjectDocs(config);
  for (const f of docFiles) {
    files.push(f);
  }

  return files;
}

// Re-export individual renderers for use in skills-install and other commands
export { renderClaudeMd } from './claude-md.js';
export { renderFrameSkill } from './skills/frame.js';
export { renderBuildSkill } from './skills/build.js';
export { renderCriticSkill } from './skills/critic.js';
export { renderSyncSkill } from './skills/sync.js';
export { renderTaskTemplate } from './task-template.js';
