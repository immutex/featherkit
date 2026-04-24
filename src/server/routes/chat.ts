import { randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { z } from 'zod/v4';

import type { FeatherConfig } from '../../config/schema.js';
import { loadState } from '../../mcp/state-io.js';
import { readJsonBody, sendJson } from '../utils.js';

const ChatRequestSchema = z.object({
  projectId: z.string().trim().min(1),
  message: z.string().trim().min(1),
});

type ChatRouteContext = {
  config: FeatherConfig;
  cwd?: string;
  readOnly?: boolean;
};

export async function handleChatRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  context: ChatRouteContext,
): Promise<boolean> {
  if (pathname !== '/api/chat' || req.method !== 'POST') {
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

  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    sendJson(res, 400, { error: 'Invalid chat payload.', issues: parsed.error.issues });
    return true;
  }

  const cwd = context.cwd ?? process.cwd();
  const state = await loadState(context.config.stateDir, cwd);
  if (!state.orchestrator || state.orchestrator.status === 'idle') {
    sendJson(res, 409, { error: 'No orchestrator running for this project' });
    return true;
  }

  const requestId = randomUUID();
  const event = {
    type: 'user-input' as const,
    at: new Date().toISOString(),
    projectId: parsed.data.projectId,
    message: parsed.data.message,
    requestId,
    ...(state.currentTask ? { taskId: state.currentTask } : {}),
  };

  const statePath = join(cwd, context.config.stateDir);
  await mkdir(statePath, { recursive: true });
  await appendFile(join(statePath, 'events.jsonl'), `${JSON.stringify(event)}\n`, 'utf8');

  sendJson(res, 200, {
    ok: true,
    queued: true,
    requestId,
    projectId: parsed.data.projectId,
  });
  return true;
}
