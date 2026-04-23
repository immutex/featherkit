import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { AuthStorage, getAgentDir } from '@mariozechner/pi-coding-agent';
import { Command } from 'commander';
import { execa, type Options as ExecaOptions, type ResultPromise } from 'execa';

import { loadConfig } from '../config/loader.js';
import { createPiLoader, type PiProviderInfo } from '../integrations/pi-loader.js';
import { log } from '../utils/logger.js';

type CommandResult = {
  exitCode?: number | null;
  stderr?: string;
};

type AuthStatus = 'connected' | 'disconnected' | 'expired' | 'error';

type AuthRow = {
  name: string;
  provider: string;
  status: AuthStatus;
  auth: 'claude-cli' | 'pi';
  models: string[];
  note?: string;
};

type PiAuthStorage = {
  get: (provider: string) => Promise<unknown>;
  hasAuth: (provider: string) => Promise<boolean>;
  remove: (provider: string) => Promise<void>;
};

type CommandRunner = (
  file: string,
  args?: readonly string[],
  options?: ExecaOptions,
) => Promise<CommandResult>;

interface AuthCommandDeps {
  claudeDir: string;
  createPiAuthStorage: (authPath: string) => PiAuthStorage;
  createPiLoader: typeof createPiLoader;
  getAgentDir: () => string;
  loadConfig: typeof loadConfig;
  runCommand: CommandRunner;
  writeStdout: (text: string) => void;
}

const defaultAuthDeps: AuthCommandDeps = {
  claudeDir: join(homedir(), '.claude'),
  createPiAuthStorage: (authPath) => AuthStorage.create(authPath) as unknown as PiAuthStorage,
  createPiLoader,
  getAgentDir,
  loadConfig,
  runCommand: async (file, args, options) => execa(file, args ?? [], options) as unknown as ResultPromise<Record<string, never>>,
  writeStdout: (text) => {
    process.stdout.write(text);
  },
};

function normalizeProviderName(provider: string): string {
  return provider.toLowerCase() === 'claude' ? 'anthropic' : provider.toLowerCase();
}

function isClaudeProvider(provider: string): boolean {
  const normalized = normalizeProviderName(provider);
  return normalized === 'anthropic';
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function extractExpiry(value: unknown): number | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of ['expires', 'expiresAt', 'expires_at']) {
    const raw = record[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return raw;
    }
    if (typeof raw === 'string') {
      const asNumber = Number(raw);
      if (Number.isFinite(asNumber)) {
        return asNumber;
      }
      const asDate = Date.parse(raw);
      if (!Number.isNaN(asDate)) {
        return asDate;
      }
    }
  }

  return null;
}

async function commandExists(binary: string, deps: AuthCommandDeps): Promise<boolean> {
  try {
    const result = await deps.runCommand(binary, ['--version'], { reject: false });
    return (result.exitCode ?? 1) === 0;
  } catch {
    return false;
  }
}

async function hasClaudeSession(claudeDir: string): Promise<boolean> {
  try {
    const entries = await readdir(claudeDir, { recursive: true, withFileTypes: true });
    return entries.some((entry) =>
      entry.isFile() && (entry.name.endsWith('.json') || entry.name.includes('session') || entry.name.includes('auth')),
    );
  } catch {
    return false;
  }
}

async function getClaudeRow(configProviders: string[], deps: AuthCommandDeps): Promise<AuthRow> {
  const installed = await commandExists('claude', deps);
  const authenticated = installed && (await hasClaudeSession(deps.claudeDir));

  return {
    name: 'claude',
    provider: 'anthropic',
    status: authenticated ? 'connected' : 'disconnected',
    auth: 'claude-cli',
    models: configProviders,
    note: installed ? undefined : 'Install Claude Code CLI.',
  };
}

async function getPiRows(cwd: string, deps: AuthCommandDeps): Promise<AuthRow[]> {
  const config = await deps.loadConfig(cwd);
  const configuredProviders = unique(
    config.models
      .map((model) => model.provider)
      .filter((provider) => provider !== 'anthropic'),
  );

  let listedProviders: PiProviderInfo[] = [];
  try {
    const loader = await withTimeout(deps.createPiLoader(config, cwd), 1_500, null);
    listedProviders = loader ? await withTimeout(loader.listProviders(), 1_500, []) : [];
  } catch {
    listedProviders = [];
  }

  const modelsByProvider = new Map<string, string[]>();
  for (const provider of configuredProviders) {
    modelsByProvider.set(provider, config.models.filter((model) => model.provider === provider).map((model) => model.model));
  }
  for (const provider of listedProviders) {
    modelsByProvider.set(provider.provider, unique([...(modelsByProvider.get(provider.provider) ?? []), ...provider.models]));
  }

  if (modelsByProvider.size === 0) {
    return [];
  }

  const authStorage = deps.createPiAuthStorage(join(deps.getAgentDir(), 'auth.json'));
  const rows: AuthRow[] = [];

  for (const provider of [...modelsByProvider.keys()].sort()) {
    try {
      const hasAuth = await authStorage.hasAuth(provider);
      if (!hasAuth) {
        rows.push({
          name: provider,
          provider,
          status: 'disconnected',
          auth: 'pi',
          models: modelsByProvider.get(provider) ?? [],
        });
        continue;
      }

      const record = await authStorage.get(provider);
      const expiry = extractExpiry(record);
      rows.push({
        name: provider,
        provider,
        status: expiry !== null && expiry <= Date.now() ? 'expired' : 'connected',
        auth: 'pi',
        models: modelsByProvider.get(provider) ?? [],
      });
    } catch (error) {
      rows.push({
        name: provider,
        provider,
        status: 'error',
        auth: 'pi',
        models: modelsByProvider.get(provider) ?? [],
        note: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return rows;
}

function renderAuthTable(rows: AuthRow[]): string {
  const headers = ['name', 'provider', 'status', 'auth', 'models', 'note'] as const;
  const widths = new Map<string, number>();

  for (const header of headers) {
    widths.set(header, header.length);
  }

  const serialized = rows.map((row) => ({
    name: row.name,
    provider: row.provider,
    status: row.status,
    auth: row.auth,
    models: row.models.join(', ') || '—',
    note: row.note ?? '—',
  }));

  for (const row of serialized) {
    for (const header of headers) {
      widths.set(header, Math.max(widths.get(header) ?? 0, row[header].length));
    }
  }

  const format = (row: Record<(typeof headers)[number], string>) =>
    headers
      .map((header) => row[header].padEnd(widths.get(header) ?? header.length))
      .join('  ')
      .trimEnd();

  return `${format({ name: 'name', provider: 'provider', status: 'status', auth: 'auth', models: 'models', note: 'note' })}\n${serialized.map(format).join('\n')}\n`;
}

export async function runAuthStatus(cwd = process.cwd(), deps: AuthCommandDeps = defaultAuthDeps): Promise<void> {
  const config = await deps.loadConfig(cwd);
  const claudeModels = config.models.filter((model) => model.provider === 'anthropic').map((model) => model.model);
  const rows = [(await getClaudeRow(claudeModels, deps)), ...(await getPiRows(cwd, deps))];
  deps.writeStdout(renderAuthTable(rows));
}

export async function runAuthLogin(provider: string, cwd = process.cwd(), deps: AuthCommandDeps = defaultAuthDeps): Promise<void> {
  const normalized = normalizeProviderName(provider);
  if (isClaudeProvider(normalized)) {
    deps.writeStdout('Run `claude auth login` to authenticate.\n');
    return;
  }

  const result = await deps.runCommand('pi', ['login', normalized], {
    cwd,
    reject: false,
    stdio: 'inherit',
    env: { ...process.env },
  });

  if ((result.exitCode ?? 0) !== 0) {
    throw new Error(result.stderr || `pi login ${normalized} failed with exit code ${result.exitCode}`);
  }
}

export async function runAuthLogout(provider: string, deps: AuthCommandDeps = defaultAuthDeps): Promise<void> {
  const normalized = normalizeProviderName(provider);
  if (isClaudeProvider(normalized)) {
    deps.writeStdout('Run `claude auth logout` to sign out.\n');
    return;
  }

  const authStorage = deps.createPiAuthStorage(join(deps.getAgentDir(), 'auth.json'));
  await authStorage.remove(normalized);
  deps.writeStdout(`Removed stored auth for ${normalized}.\n`);
}

export const authCommand = new Command('auth')
  .description('Check and manage provider authentication');

authCommand
  .command('status')
  .description('List configured providers and auth status')
  .action(async () => {
    try {
      await runAuthStatus();
    } catch (error) {
      log.error(String(error));
      process.exit(1);
    }
  });

authCommand
  .command('login')
  .argument('<provider>', 'Provider id (e.g. claude, anthropic, openai)')
  .description('Authenticate a provider')
  .action(async (provider: string) => {
    try {
      await runAuthLogin(provider);
    } catch (error) {
      log.error(String(error));
      process.exit(1);
    }
  });

authCommand
  .command('logout')
  .argument('<provider>', 'Provider id (e.g. claude, anthropic, openai)')
  .description('Remove stored authentication for a provider')
  .action(async (provider: string) => {
    try {
      await runAuthLogout(provider);
    } catch (error) {
      log.error(String(error));
      process.exit(1);
    }
  });
