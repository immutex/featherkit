import { Command } from 'commander';
import { basename, dirname } from 'path';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import {
  input,
  select,
  checkbox,
  confirm,
} from '@inquirer/prompts';

import { defaultConfig, MODEL_CATALOG, MODEL_PRESETS, type ModelOption } from '../config/defaults.js';
import { getAllTemplates } from '../templates/index.js';
import { writeIfNotExists } from '../utils/fs.js';
import { log } from '../utils/logger.js';
import { generateClaudeCodeConfig } from '../generators/claude-code.js';
import { generateOpenCodeConfig } from '../generators/opencode.js';
import type { FeatherConfig, Clients, ModelConfig } from '../config/schema.js';

// ── Exported testable init logic ──────────────────────────────────────────────

export interface InitOptions {
  force?: boolean;
  preset?: string;
  localOnly?: boolean;
}

export async function runInit(cwd: string, options: InitOptions): Promise<void> {
  const config = await buildConfig(cwd, options);
  await scaffoldFiles(cwd, config, options.force ?? false);
}

async function buildConfig(cwd: string, options: InitOptions): Promise<FeatherConfig> {
  const dirName = basename(cwd);

  log.bold('\nFeatherKit init\n');

  // 1. Project name
  const projectName = await input({
    message: 'Project name:',
    default: dirName,
  });

  // 2. Client selection
  const clients = await select<Clients>({
    message: 'Which coding clients will you use?',
    choices: [
      { name: 'Both (Claude Code + OpenCode)', value: 'both' },
      { name: 'Claude Code only', value: 'claude-code' },
      { name: 'OpenCode only', value: 'opencode' },
    ],
    default: 'both',
  });

  // 3. Model selection
  let models: ModelConfig[];

  if (options.preset) {
    const preset = MODEL_PRESETS[options.preset];
    if (!preset) {
      log.warn(`Unknown preset "${options.preset}", falling back to "balanced"`);
      models = MODEL_PRESETS['balanced']!;
    } else {
      models = preset;
    }
    log.info(`Using preset: ${options.preset}`);
  } else {
    const presetChoice = await select<string>({
      message: 'Model preset:',
      choices: [
        { name: 'Balanced     (Sonnet 4.6 frame/build · GPT-5.4 critic · Haiku 4.5 sync)', value: 'balanced' },
        { name: 'Low-cost     (Haiku 4.5 frame/critic/sync · Sonnet 4.6 build)', value: 'low-cost' },
        { name: 'High-quality (Opus 4.7 frame · Sonnet 4.6 build · GPT-5.4 critic)', value: 'high-quality' },
        { name: 'Open-source  (Qwen3.6 Plus frame/build/sync · GLM-5.1 critic, via OpenRouter)', value: 'open-source' },
        { name: 'Custom       — pick a model for each role', value: 'manual' },
      ],
    });

    if (presetChoice === 'manual') {
      models = await promptManualModels();
    } else {
      models = MODEL_PRESETS[presetChoice] ?? MODEL_PRESETS['balanced']!;
    }
  }

  // 4. Integrations
  let integrations = { linear: false, github: false, context7: false, webSearch: false };

  if (!options.localOnly) {
    const selected = await checkbox({
      message: 'Enable integrations (space to toggle, enter to confirm):',
      choices: [
        { name: 'Linear (issue tracker)', value: 'linear' },
        { name: 'GitHub (PR/issue tools)', value: 'github' },
        { name: 'Context7 (library docs)', value: 'context7' },
        { name: 'Web Search', value: 'webSearch' },
      ],
    });
    for (const key of selected) {
      (integrations as Record<string, boolean>)[key] = true;
    }
  }

  const config: FeatherConfig = {
    version: 1,
    projectName,
    clients,
    models,
    integrations,
    stateDir: '.project-state',
    docsDir: 'project-docs',
  };

  // 5. Confirm
  log.blank();
  log.bold('Summary:');
  log.info(`Project: ${config.projectName}`);
  log.info(`Clients: ${config.clients}`);
  log.info(`Models: ${config.models.map((m) => `${m.role}=${m.model}`).join(', ')}`);
  const enabledIntegrations = Object.entries(config.integrations)
    .filter(([, v]) => v)
    .map(([k]) => k);
  log.info(`Integrations: ${enabledIntegrations.length ? enabledIntegrations.join(', ') : 'none'}`);
  log.blank();

  const ok = await confirm({ message: 'Create these files?', default: true });
  if (!ok) {
    log.info('Aborted.');
    process.exit(0);
  }

  return config;
}

async function promptManualModels(): Promise<ModelConfig[]> {
  const roles = ['frame', 'build', 'critic', 'sync'] as const;
  const models: ModelConfig[] = [];
  const defaultModel = MODEL_CATALOG.find((m) => m.model === 'claude-sonnet-4-6') ?? MODEL_CATALOG[0]!;

  for (const role of roles) {
    const chosen = await select<ModelOption>({
      message: `Model for ${role} role:`,
      choices: MODEL_CATALOG.map((m) => ({ name: m.label, value: m })),
      default: defaultModel,
    });
    models.push({ provider: chosen.provider, model: chosen.model, role });
  }

  return models;
}

export async function scaffoldFiles(
  cwd: string,
  config: FeatherConfig,
  force: boolean
): Promise<void> {
  const templates = getAllTemplates(config);
  const created: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];

  for (const { relativePath, content, managed } of templates) {
    const fullPath = join(cwd, relativePath);
    const exists = existsSync(fullPath);

    if (managed || force) {
      // Managed files (skills, agents) are always kept current.
      // --force overwrites everything else too.
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, 'utf8');
      if (exists && !force) {
        updated.push(relativePath);
      } else {
        created.push(relativePath);
      }
    } else {
      const wasWritten = await writeIfNotExists(fullPath, content);
      if (wasWritten) {
        created.push(relativePath);
      } else {
        skipped.push(relativePath);
      }
    }
  }

  log.blank();
  if (created.length > 0) {
    log.bold('Files created:');
    for (const f of created) log.success(f);
  }

  if (updated.length > 0) {
    log.blank();
    log.bold('Files updated:');
    for (const f of updated) log.success(f);
  }

  if (skipped.length > 0) {
    log.blank();
    log.dim(`Skipped (already exist): ${skipped.length} file(s). Use --force to overwrite.`);
  }

  // Register MCP server with clients
  log.blank();
  const includeClaudeCode = config.clients === 'claude-code' || config.clients === 'both';
  const includeOpenCode = config.clients === 'opencode' || config.clients === 'both';
  if (includeClaudeCode) {
    await generateClaudeCodeConfig(cwd);
    log.success('.claude/settings.local.json — MCP registered');
  }
  if (includeOpenCode) {
    await generateOpenCodeConfig(cwd, config);
    log.success('.opencode/opencode.json — MCP registered');
  }

  log.blank();
  log.success('Done. Run `npx featherkit doctor` to verify the setup.');
}

// ── Commander command ─────────────────────────────────────────────────────────

export const initCommand = new Command('init')
  .description('Scaffold project structure, skills, and MCP config')
  .option('--force', 'Overwrite existing files')
  .option('--preset <name>', 'Skip model selection and use a preset (balanced, low-cost, high-quality, open-source)')
  .option('--local-only', 'Skip all integration prompts')
  .action(async (options: InitOptions) => {
    try {
      await runInit(process.cwd(), options);
    } catch (err) {
      // inquirer throws on Ctrl-C — treat as clean exit
      if ((err as NodeJS.ErrnoException).name === 'ExitPromptError') {
        log.blank();
        log.info('Cancelled.');
        process.exit(0);
      }
      log.error(String(err));
      process.exit(1);
    }
  });
