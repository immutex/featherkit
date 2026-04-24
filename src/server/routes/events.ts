import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';

import type { FeatherConfig } from '../../config/schema.js';
import { sendJson } from '../utils.js';

type EventsRouteContext = {
  config: FeatherConfig;
  cwd?: string;
};

function parseLimit(raw: string | null): number {
  if (!raw) {
    return 50;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    return 50;
  }

  return Math.min(value, 200);
}

export async function handleEventsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  context: EventsRouteContext,
): Promise<boolean> {
  if (url.pathname !== '/api/events' || req.method !== 'GET') {
    return false;
  }

  const cwd = context.cwd ?? process.cwd();
  const eventLogPath = join(cwd, context.config.stateDir, 'events.jsonl');
  const limit = parseLimit(url.searchParams.get('limit'));

  let raw = '';
  try {
    raw = await readFile(eventLogPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      sendJson(res, 200, []);
      return true;
    }

    throw error;
  }

  const events = raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .slice(-limit)
    .reverse()
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as Record<string, unknown>];
      } catch {
        return [];
      }
    });

  sendJson(res, 200, events);
  return true;
}
