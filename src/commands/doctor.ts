import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import { readFile } from 'fs/promises';

import { FeatherConfigSchema, ProjectStateSchema } from '../config/schema.js';
import { log } from '../utils/logger.js';

interface CheckResult {
  label: string;
  pass: boolean;
  detail?: string;
}

function pass(label: string, detail?: string): CheckResult {
  return { label, pass: true, detail };
}

function fail(label: string, detail?: string): CheckResult {
  return { label, pass: false, detail };
}

async function tryReadJson(filePath: string): Promise<unknown | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function runDoctor(cwd: string): Promise<boolean> {
  const results: CheckResult[] = [];

  // 1. featherkit/config.json exists and validates
  const configPath = join(cwd, 'featherkit', 'config.json');
  if (!existsSync(configPath)) {
    results.push(fail('featherkit/config.json', 'File not found. Run `featherkit init`.'));
  } else {
    const parsed = await tryReadJson(configPath);
    const result = FeatherConfigSchema.safeParse(parsed);
    if (result.success) {
      results.push(pass('featherkit/config.json', `project: ${result.data.projectName}`));

      const config = result.data;

      // 2. .project-state/state.json exists and validates
      const statePath = join(cwd, config.stateDir, 'state.json');
      if (!existsSync(statePath)) {
        results.push(fail(`${config.stateDir}/state.json`, 'File not found. Run `featherkit init`.'));
      } else {
        const stateParsed = await tryReadJson(statePath);
        const stateResult = ProjectStateSchema.safeParse(stateParsed);
        if (stateResult.success) {
          results.push(pass(`${config.stateDir}/state.json`));
        } else {
          results.push(fail(`${config.stateDir}/state.json`, 'Schema validation failed'));
        }
      }

      // 3. Expected skill/config files exist based on client config
      const includeClaudeCode = config.clients === 'claude-code' || config.clients === 'both';
      const includeOpenCode = config.clients === 'opencode' || config.clients === 'both';

      if (includeClaudeCode) {
        const skillFiles = [
          '.claude/CLAUDE.md',
          '.claude/commands/frame.md',
          '.claude/commands/build.md',
          '.claude/commands/critic.md',
          '.claude/commands/sync.md',
        ];
        const missing = skillFiles.filter((f) => !existsSync(join(cwd, f)));
        if (missing.length === 0) {
          results.push(pass('Claude Code skill files'));
        } else {
          results.push(fail('Claude Code skill files', `Missing: ${missing.join(', ')}`));
        }

        // 5a. Claude Code client config references MCP server
        const claudeSettings = join(cwd, '.claude', 'settings.local.json');
        if (!existsSync(claudeSettings)) {
          results.push(fail('.claude/settings.local.json', 'Not found. Run `featherkit mcp install`.'));
        } else {
          const settings = await tryReadJson(claudeSettings) as Record<string, unknown> | null;
          const hasMcp =
            settings &&
            typeof settings['mcpServers'] === 'object' &&
            settings['mcpServers'] !== null &&
            'featherkit' in (settings['mcpServers'] as object);
          if (hasMcp) {
            results.push(pass('.claude/settings.local.json — MCP registered'));
          } else {
            results.push(fail('.claude/settings.local.json', 'featherkit MCP entry missing. Run `featherkit mcp install`.'));
          }
        }
      }

      if (includeOpenCode) {
        const openCodeConfig = join(cwd, '.opencode', 'opencode.json');
        if (!existsSync(openCodeConfig)) {
          results.push(fail('.opencode/opencode.json', 'Not found. Run `featherkit init`.'));
        } else {
          const cfg = await tryReadJson(openCodeConfig) as Record<string, unknown> | null;
          const hasMcp =
            cfg &&
            typeof cfg['mcp'] === 'object' &&
            cfg['mcp'] !== null &&
            'featherkit' in (cfg['mcp'] as object);
          if (hasMcp) {
            results.push(pass('.opencode/opencode.json — MCP registered'));
          } else {
            results.push(fail('.opencode/opencode.json', 'featherkit MCP entry missing'));
          }
        }
      }

      // 4. MCP server entry point exists
      const serverPath = join(cwd, 'node_modules', 'featherkit', 'dist', 'server.js');
      if (existsSync(serverPath)) {
        results.push(pass('MCP server (node_modules/@1mmutex/featherkit/dist/server.js)'));
      } else {
        results.push(fail('MCP server', 'node_modules/@1mmutex/featherkit/dist/server.js not found. Run `npm install featherkit`.'));
      }

      // 6. Required project-docs files exist
      const docFiles = [
        `${config.docsDir}/context/architecture.md`,
        `${config.docsDir}/active/current-focus.md`,
        `${config.docsDir}/active/latest-handoff.md`,
      ];
      const missingDocs = docFiles.filter((f) => !existsSync(join(cwd, f)));
      if (missingDocs.length === 0) {
        results.push(pass('project-docs files'));
      } else {
        results.push(fail('project-docs files', `Missing: ${missingDocs.join(', ')}`));
      }
    } else {
      const issues = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      results.push(fail('featherkit/config.json', `Invalid schema: ${issues}`));
    }
  }

  // Print results
  log.blank();
  log.bold('FeatherKit doctor\n');

  let anyFail = false;
  for (const r of results) {
    if (r.pass) {
      log.success(r.label + (r.detail ? `  ${r.detail}` : ''));
    } else {
      log.error(r.label + (r.detail ? `\n  → ${r.detail}` : ''));
      anyFail = true;
    }
  }

  log.blank();
  if (anyFail) {
    log.warn('Some checks failed. See above for details.');
  } else {
    log.success('All checks passed.');
  }

  return !anyFail;
}

export const doctorCommand = new Command('doctor')
  .description('Verify FeatherKit setup and dependencies')
  .action(async () => {
    const ok = await runDoctor(process.cwd());
    if (!ok) process.exit(1);
  });
