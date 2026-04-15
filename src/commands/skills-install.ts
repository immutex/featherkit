import { Command } from 'commander';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { loadConfig } from '../config/loader.js';
import { renderClaudeMd } from '../templates/claude-md.js';
import { renderFrameSkill } from '../templates/skills/frame.js';
import { renderBuildSkill } from '../templates/skills/build.js';
import { renderCriticSkill } from '../templates/skills/critic.js';
import { renderSyncSkill } from '../templates/skills/sync.js';
import { log } from '../utils/logger.js';
import type { FeatherConfig } from '../config/schema.js';

export interface SkillFile {
  relativePath: string;
  content: string;
}

export function getSkillFiles(config: FeatherConfig): SkillFile[] {
  const files: SkillFile[] = [];
  const includeClaudeCode = config.clients === 'claude-code' || config.clients === 'both';

  if (includeClaudeCode) {
    files.push({ relativePath: '.claude/CLAUDE.md', content: renderClaudeMd(config) });
    files.push({ relativePath: '.claude/commands/frame.md', content: renderFrameSkill(config) });
    files.push({ relativePath: '.claude/commands/build.md', content: renderBuildSkill(config) });
    files.push({ relativePath: '.claude/commands/critic.md', content: renderCriticSkill(config) });
    files.push({ relativePath: '.claude/commands/sync.md', content: renderSyncSkill(config) });
  }

  return files;
}

export async function runSkillsInstall(cwd: string): Promise<SkillFile[]> {
  const config = await loadConfig(cwd);
  const files = getSkillFiles(config);

  for (const { relativePath, content } of files) {
    const fullPath = join(cwd, relativePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf8');
    log.success(relativePath);
  }

  log.blank();
  log.dim(`${files.length} skill file(s) updated.`);

  return files;
}

export const skillsCommand = new Command('skills').description('Skill management commands');

skillsCommand
  .command('install')
  .description('Write or update skill files from current config (useful after upgrading)')
  .action(async () => {
    try {
      await runSkillsInstall(process.cwd());
    } catch (err) {
      log.error(String(err));
      process.exit(1);
    }
  });
