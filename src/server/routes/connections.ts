import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { AuthStorage, getAgentDir } from '@mariozechner/pi-coding-agent';
import { execa, type Options as ExecaOptions, type ResultPromise } from 'execa';
import { z } from 'zod/v4';

import type { FeatherConfig } from '../../config/schema.js';
import { createPiLoader, type PiProviderInfo } from '../../integrations/pi-loader.js';
import { readJsonBody, sendJson, writeJsonAtomic } from '../utils.js';

type CommandResult = {
  exitCode?: number | null;
  stderr?: string;
};

const McpConfigSchema = z.object({
  mcpServers: z.record(z.string(), z.object({}).passthrough()).default({}),
}).passthrough();

type ConnectionsRouteContext = {
  config: FeatherConfig;
  cwd?: string;
  readOnly?: boolean;
  deps?: ConnectionsRouteDeps;
};

type ProviderStatus = 'connected' | 'unauthenticated' | 'expired' | 'error';

type ProviderRecord = {
  provider: string;
  label: string;
  authType: 'cli' | 'pi';
  status: ProviderStatus;
  connected: boolean;
  installed: boolean;
  models: string[];
  usedByRoles: string[];
  warning?: string;
};

type PiAuthStorage = {
  get: (provider: string) => Promise<unknown>;
  hasAuth: (provider: string) => Promise<boolean>;
};

type CommandRunner = (
  file: string,
  args?: readonly string[],
  options?: ExecaOptions,
) => Promise<CommandResult>;

type ConnectionsRouteDeps = {
  claudeDir: string;
  createPiAuthStorage: (authPath: string) => PiAuthStorage;
  createPiLoader: typeof createPiLoader;
  getAgentDir: () => string;
  runCommand: CommandRunner;
};

const defaultConnectionsRouteDeps: ConnectionsRouteDeps = {
  claudeDir: join(homedir(), '.claude'),
  createPiAuthStorage: (authPath) => AuthStorage.create(authPath) as unknown as PiAuthStorage,
  createPiLoader,
  getAgentDir,
  runCommand: async (file, args, options) => execa(file, args ?? [], options) as unknown as ResultPromise<Record<string, never>>,
};

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

function normalizeProviderName(provider: string): string {
  return provider.toLowerCase() === 'claude' ? 'anthropic' : provider.toLowerCase();
}

async function commandExists(binary: string, deps: ConnectionsRouteDeps): Promise<boolean> {
  try {
    const result = await deps.runCommand(binary, ['--version'], { reject: false, timeout: 250 });
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

export async function listConnectionProviders(
  config: FeatherConfig,
  cwd = process.cwd(),
  deps: ConnectionsRouteDeps = defaultConnectionsRouteDeps,
): Promise<ProviderRecord[]> {
  const rolesByProvider = new Map<string, string[]>();
  const configuredModelsByProvider = new Map<string, string[]>();
  for (const model of config.models) {
    configuredModelsByProvider.set(model.provider, unique([...(configuredModelsByProvider.get(model.provider) ?? []), model.model]));
    rolesByProvider.set(model.provider, unique([...(rolesByProvider.get(model.provider) ?? []), model.role]));
  }

  const piInstalled = await commandExists('pi', deps);
  let piProviders: PiProviderInfo[] = [];
  try {
    if (piInstalled) {
      const loader = await withTimeout(deps.createPiLoader(config, cwd), 250, null);
      piProviders = loader ? await withTimeout(loader.listProviders(), 250, []) : [];
    }
  } catch {
    piProviders = [];
  }

  for (const provider of piProviders) {
    configuredModelsByProvider.set(
      provider.provider,
      unique([...(configuredModelsByProvider.get(provider.provider) ?? []), ...provider.models]),
    );
  }

  const claudeInstalled = await commandExists('claude', deps);
  const claudeAuthenticated = claudeInstalled && (await hasClaudeSession(deps.claudeDir));
  const rows: ProviderRecord[] = [
    {
      provider: 'anthropic',
      label: 'Claude',
      authType: 'cli',
      status: claudeAuthenticated ? 'connected' : 'unauthenticated',
      connected: claudeAuthenticated,
      installed: claudeInstalled,
      models: configuredModelsByProvider.get('anthropic') ?? [],
      usedByRoles: rolesByProvider.get('anthropic') ?? [],
      warning: claudeInstalled ? undefined : 'Install Claude Code CLI.',
    },
  ];

  const authStorage = deps.createPiAuthStorage(join(deps.getAgentDir(), 'auth.json'));
  const piProviderNames = [...configuredModelsByProvider.keys()].filter((provider) => provider !== 'anthropic').sort();

  for (const provider of piProviderNames) {
    try {
      const hasAuth = piInstalled ? await authStorage.hasAuth(provider) : false;
      const record = hasAuth ? await authStorage.get(provider) : undefined;
      const expiry = extractExpiry(record);
      const status = !piInstalled
        ? 'unauthenticated'
        : !hasAuth
          ? 'unauthenticated'
          : expiry !== null && expiry <= Date.now()
            ? 'expired'
            : 'connected';

      rows.push({
        provider,
        label: provider,
        authType: 'pi',
        status,
        connected: status === 'connected',
        installed: piInstalled,
        models: configuredModelsByProvider.get(provider) ?? [],
        usedByRoles: rolesByProvider.get(provider) ?? [],
        warning: piInstalled ? undefined : 'Install pi to authenticate non-Claude providers.',
      });
    } catch (error) {
      rows.push({
        provider,
        label: provider,
        authType: 'pi',
        status: 'error',
        connected: false,
        installed: piInstalled,
        models: configuredModelsByProvider.get(provider) ?? [],
        usedByRoles: rolesByProvider.get(provider) ?? [],
        warning: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return rows;
}

async function loadConnectionsFile(filePath: string): Promise<z.infer<typeof McpConfigSchema>> {
  try {
    const raw = JSON.parse(await readFile(filePath, 'utf8'));
    return McpConfigSchema.parse(raw);
  } catch {
    return { mcpServers: {} };
  }
}

export async function handleConnectionsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  context: ConnectionsRouteContext,
): Promise<boolean> {
  const deps = context.deps ?? defaultConnectionsRouteDeps;
  const cwd = context.cwd ?? process.cwd();

  if (pathname === '/api/connections/providers' && req.method === 'GET') {
    const providers = await listConnectionProviders(context.config, cwd, deps);
    sendJson(res, 200, { providers });
    return true;
  }

  const statusMatch = pathname.match(/^\/api\/connections\/providers\/([^/]+)\/status$/);
  if (statusMatch && req.method === 'GET') {
    const provider = normalizeProviderName(decodeURIComponent(statusMatch[1]!));
    const providers = await listConnectionProviders(context.config, cwd, deps);
    const match = providers.find((entry) => entry.provider === provider);
    if (!match) {
      sendJson(res, 404, { error: `Unknown provider: ${provider}` });
      return true;
    }

    sendJson(res, 200, match);
    return true;
  }

  const loginMatch = pathname.match(/^\/api\/connections\/providers\/([^/]+)\/login$/);
  if (loginMatch && req.method === 'POST') {
    const provider = normalizeProviderName(decodeURIComponent(loginMatch[1]!));
    if (provider === 'anthropic') {
      sendJson(res, 200, { type: 'cli', instruction: 'Run: claude auth login' });
      return true;
    }

    sendJson(res, 200, { type: 'cli', instruction: `Run: pi login ${provider}` });
    return true;
  }

  if (pathname !== '/api/connections') {
    return false;
  }

  const mcpPath = join(cwd, '.mcp.json');

  if (req.method === 'GET') {
    const mcpConfig = await loadConnectionsFile(mcpPath);
    const providers = (await listConnectionProviders(context.config, cwd, deps)).map((provider) => ({
      provider: provider.provider,
      connected: provider.connected,
    }));

    sendJson(res, 200, {
      mcpServers: mcpConfig.mcpServers,
      providers,
    });
    return true;
  }

  if (req.method !== 'PUT') {
    return false;
  }

  if (context.readOnly) {
    sendJson(res, 409, { error: 'Dashboard server is running in read-only mode.' });
    return true;
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body.' });
    return true;
  }

  const parsed = McpConfigSchema.safeParse(body);
  if (!parsed.success) {
    sendJson(res, 400, { error: 'Invalid .mcp.json payload.', issues: parsed.error.issues });
    return true;
  }

  await writeJsonAtomic(mcpPath, parsed.data);
  sendJson(res, 200, parsed.data);
  return true;
}
