import { Command, InvalidArgumentError } from 'commander';
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
import { ClientsSchema, type FeatherConfig, type Clients, type ModelConfig } from '../config/schema.js';

// ── Exported testable init logic ──────────────────────────────────────────────

export interface InitOptions {
  force?: boolean;
  name?: string;
  preset?: string;
  clients?: Clients;
  yes?: boolean;
  localOnly?: boolean;
}

function parseClientsOption(value: string): Clients {
  const parsed = ClientsSchema.safeParse(value);
  if (!parsed.success) {
    throw new InvalidArgumentError('Expected one of: both, claude-code, opencode.');
  }

  return parsed.data;
}

export async function runInit(cwd: string, options: InitOptions): Promise<void> {
  const config = await buildConfig(cwd, options);
  await scaffoldFiles(cwd, config, options.force ?? false);
}

async function buildConfig(cwd: string, options: InitOptions): Promise<FeatherConfig> {
  const dirName = basename(cwd);

  log.bold('\nFeatherKit init\n');

  // 1. Project name
  const projectName = options.name ?? await input({
    message: 'Project name:',
    default: dirName,
  });

  // 2. Client selection
  const clients = options.clients ?? await select<Clients>({
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
  let integrations = { linear: false, github: false, context7: false, webSearch: false, playwright: false };

  if (!options.localOnly) {
    const selected = await checkbox({
      message: 'Enable integrations (space to toggle, enter to confirm):',
      choices: [
        { name: 'Linear       — issue tracker MCP (OAuth, no key needed)', value: 'linear' },
        { name: 'GitHub       — PR/issue tools (needs GITHUB_PERSONAL_ACCESS_TOKEN)', value: 'github' },
        { name: 'Context7     — live library docs (free, no key)', value: 'context7' },
        { name: 'Web Search   — Tavily search (free tier, needs TAVILY_API_KEY)', value: 'webSearch' },
        { name: 'Playwright   — browser automation & UI testing (free, no key)', value: 'playwright' },
      ],
    });
    for (const key of selected) {
      (integrations as Record<string, boolean>)[key] = true;
    }
  }

  const config: FeatherConfig = {
    ...defaultConfig(projectName, options.preset),
    clients,
    models,
    integrations,
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

  const ok = options.yes ? true : await confirm({ message: 'Create these files?', default: true });
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

    if (managed || force) {
      const alreadyExisted = managed && !force && existsSync(fullPath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, 'utf8');
      if (alreadyExisted) {
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
    await generateClaudeCodeConfig(cwd, config);
    log.success('.mcp.json + .claude/settings.local.json — MCP registered');
  }
  if (includeOpenCode) {
    await generateOpenCodeConfig(cwd, config);
    log.success('.opencode/opencode.json — MCP registered');
  }

  log.blank();
  log.success('Done. Run `feather doctor` to verify the setup.');
}

// ── Commander command ─────────────────────────────────────────────────────────

export const initCommand = new Command('init')
  .description('Scaffold project structure, skills, and MCP config')
  .option('--force', 'Overwrite existing files')
  .option('--name <name>', 'Use the provided project name without prompting')
  .option('--preset <name>', 'Skip model selection and use a preset (balanced, low-cost, high-quality, open-source)')
  .option('--clients <client>', 'Use the provided clients (both, claude-code, opencode) without prompting', parseClientsOption)
  .option('-y, --yes', 'Skip confirmation and create files immediately')
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
