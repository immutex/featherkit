import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';

import { z } from 'zod/v4';

import type { FeatherConfig } from '../../config/schema.js';
import { ModelConfigSchema } from '../../config/schema.js';
import { getConfigPath, loadConfig } from '../../config/loader.js';
import { readJsonBody, sendJson, writeJsonAtomic } from '../utils.js';

const AgentsPayloadSchema = z.object({
  models: z.array(ModelConfigSchema),
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
  if (pathname !== '/api/agents') {
    return false;
  }

  if (req.method === 'GET') {
    const config = await loadConfig(context.cwd);
    sendJson(res, 200, { models: config.models });
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

  const parsed = AgentsPayloadSchema.safeParse(body);
  if (!parsed.success) {
    sendJson(res, 400, { error: 'Invalid agents payload.', issues: parsed.error.issues });
    return true;
  }

  const configPath = getConfigPath(context.cwd);
  await loadConfig(context.cwd);
  const rawConfig = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
  const nextConfig = {
    ...rawConfig,
    models: parsed.data.models,
  };

  await writeJsonAtomic(configPath, nextConfig);
  sendJson(res, 200, { models: nextConfig.models });
  return true;
}
