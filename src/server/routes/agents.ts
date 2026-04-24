import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';

import { z } from 'zod/v4';

import type { FeatherConfig } from '../../config/schema.js';
import { ModelConfigSchema } from '../../config/schema.js';
import { getConfigPath, loadConfig } from '../../config/loader.js';
import { readJsonBody, sendJson, writeJsonAtomic } from '../utils.js';

const BUILT_IN_ROLES = new Set(['frame', 'build', 'critic', 'sync']);

const AgentsPayloadSchema = z.object({
  models: z.array(ModelConfigSchema),
});

const CreateAgentSchema = z.object({
  role: z.string().min(1).regex(/^[a-z][a-z0-9-]*$/, 'Role must be lowercase alphanumeric with dashes, starting with a letter'),
  provider: z.string().min(1),
  model: z.string().min(1),
  systemPrompt: z.string().optional(),
});

type AgentsRouteContext = {
  config: FeatherConfig;
  cwd: string;
  readOnly?: boolean;
};

export async function handleAgentsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  context: AgentsRouteContext,
): Promise<boolean> {
  if (!pathname.startsWith('/api/agents')) {
    return false;
  }

  // GET /api/agents
  if (req.method === 'GET' && pathname === '/api/agents') {
    const config = await loadConfig(context.cwd);
    sendJson(res, 200, { models: config.models });
    return true;
  }

  // POST /api/agents — create a new agent
  if (req.method === 'POST' && pathname === '/api/agents') {
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

    const parsed = CreateAgentSchema.safeParse(body);
    if (!parsed.success) {
      sendJson(res, 400, { error: 'Invalid agent payload.', issues: parsed.error.issues });
      return true;
    }

    const { role, provider, model, systemPrompt } = parsed.data;

    const configPath = getConfigPath(context.cwd);
    const rawConfig = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
    const existingModels = (rawConfig.models ?? []) as z.infer<typeof ModelConfigSchema>[];

    if (existingModels.some((m) => m.role === role)) {
      sendJson(res, 409, { error: `Agent role "${role}" already exists.` });
      return true;
    }

    const newModel = { role, provider, model, ...(systemPrompt ? { systemPrompt } : {}) };
    const nextConfig = {
      ...rawConfig,
      models: [...existingModels, newModel],
    };

    await writeJsonAtomic(configPath, nextConfig);
    sendJson(res, 201, { models: nextConfig.models });
    return true;
  }

  // DELETE /api/agents/:role — delete a custom agent (built-in roles are protected)
  if (req.method === 'DELETE' && pathname.startsWith('/api/agents/')) {
    if (context.readOnly) {
      sendJson(res, 409, { error: 'Dashboard server is running in read-only mode.' });
      return true;
    }

    const role = decodeURIComponent(pathname.slice('/api/agents/'.length));
    if (!role || BUILT_IN_ROLES.has(role)) {
      sendJson(res, 403, { error: `Cannot delete built-in agent role "${role}".` });
      return true;
    }

    const configPath = getConfigPath(context.cwd);
    const rawConfig = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
    const existingModels = (rawConfig.models ?? []) as z.infer<typeof ModelConfigSchema>[];

    const index = existingModels.findIndex((m) => m.role === role);
    if (index === -1) {
      sendJson(res, 404, { error: `Agent role "${role}" not found.` });
      return true;
    }

    const nextModels = existingModels.filter((_, i) => i !== index);
    const nextConfig = { ...rawConfig, models: nextModels };

    await writeJsonAtomic(configPath, nextConfig);
    sendJson(res, 200, { models: nextModels });
    return true;
  }

  // PUT /api/agents — update all agents
  if (req.method === 'PUT' && pathname === '/api/agents') {
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

    const parsed = AgentsPayloadSchema.safeParse(body);
    if (!parsed.success) {
      sendJson(res, 400, { error: 'Invalid agents payload.', issues: parsed.error.issues });
      return true;
    }

    const configPath = getConfigPath(context.cwd);
    const rawConfig = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
    const nextConfig = {
      ...rawConfig,
      models: parsed.data.models,
    };

    await writeJsonAtomic(configPath, nextConfig);
    sendJson(res, 200, { models: nextConfig.models });
    return true;
  }

  return false;
}
