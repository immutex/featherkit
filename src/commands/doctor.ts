import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import { readFile } from 'fs/promises';
import { execa, type Options as ExecaOptions, type ResultPromise } from 'execa';

type CommandResult = {
  exitCode?: number | null;
};

import { FeatherConfigSchema, ProjectStateSchema } from '../config/schema.js';
import { log } from '../utils/logger.js';

interface CheckResult {
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail?: string;
}

type CommandRunner = (
  file: string,
  args?: readonly string[],
  options?: ExecaOptions,
) => Promise<CommandResult>;

interface DoctorDeps {
  runCommand: CommandRunner;
}

const defaultDoctorDeps: DoctorDeps = {
  runCommand: async (file, args, options) => execa(file, args ?? [], options) as unknown as ResultPromise<Record<string, never>>,
};

function pass(label: string, detail?: string): CheckResult {
  return { label, status: 'pass', detail };
}

function warn(label: string, detail?: string): CheckResult {
  return { label, status: 'warn', detail };
}

function fail(label: string, detail?: string): CheckResult {
  return { label, status: 'fail', detail };
}

async function tryReadJson(filePath: string): Promise<unknown | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function hasBinary(binary: string, deps: DoctorDeps): Promise<boolean> {
  try {
    const result = await deps.runCommand(binary, ['--version'], { reject: false });
    return (result.exitCode ?? 1) === 0;
  } catch {
    return false;
  }
}

export async function runDoctor(cwd: string, deps: DoctorDeps = defaultDoctorDeps): Promise<boolean> {
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

        // 5a. .mcp.json at project root references featherkit MCP server
        const mcpJson = join(cwd, '.mcp.json');
        if (!existsSync(mcpJson)) {
          results.push(fail('.mcp.json', 'Not found. Run `featherkit mcp install`.'));
        } else {
          const mcpCfg = await tryReadJson(mcpJson) as Record<string, unknown> | null;
          const hasMcp =
            mcpCfg &&
            typeof mcpCfg['mcpServers'] === 'object' &&
            mcpCfg['mcpServers'] !== null &&
            'featherkit' in (mcpCfg['mcpServers'] as object);
          if (hasMcp) {
            results.push(pass('.mcp.json — featherkit MCP registered'));
          } else {
            results.push(fail('.mcp.json', 'featherkit MCP entry missing. Run `featherkit mcp install`.'));
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

      // 4. MCP server file exists (installed via npm install)
      const mcpServerPath = join(cwd, 'node_modules/@1mmutex/featherkit/dist/server.js');
      if (existsSync(mcpServerPath)) {
        results.push(pass('MCP server', 'node_modules/@1mmutex/featherkit/dist/server.js found'));
      } else {
        results.push(fail('MCP server', 'node_modules/@1mmutex/featherkit/dist/server.js not found. Run `npm install @1mmutex/featherkit`.'));
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

      const hasClaude = await hasBinary('claude', deps);
      if (hasClaude) {
        results.push(pass('Claude CLI', 'claude --version ok'));
      } else {
        results.push(fail('Claude CLI', 'Install Claude Code CLI.'));
      }

      const hasPi = await hasBinary('pi', deps);
      if (hasPi) {
        results.push(pass('Pi CLI', 'pi --version ok'));
      } else {
        results.push(warn('Pi CLI', 'Optional for non-Claude providers. Install pi to enable provider OAuth flows.'));
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
    if (r.status === 'pass') {
      log.success(r.label + (r.detail ? `  ${r.detail}` : ''));
    } else if (r.status === 'warn') {
      log.warn(r.label + (r.detail ? `\n  → ${r.detail}` : ''));
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
