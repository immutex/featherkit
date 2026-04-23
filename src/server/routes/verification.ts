import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';

import type { FeatherConfig, VerificationRunSummary } from '../../config/schema.js';
import { loadState, saveState } from '../../mcp/state-io.js';
import { AVAILABLE_CHECKS } from '../../verification/index.js';
import { resolveTaskFiles, runChecks } from '../../verification/runner.js';
import { sendJson } from '../utils.js';

type VerificationRouteContext = {
  config: FeatherConfig;
  cwd?: string;
  readOnly?: boolean;
};

function emptySummary(): VerificationRunSummary {
  return {
    lastRunAt: null,
    checks: {},
  };
}

export async function handleVerificationRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  context: VerificationRouteContext,
): Promise<boolean> {
  const cwd = context.cwd ?? process.cwd();
  const docsDir = resolve(cwd, context.config.docsDir);

  const runMatch = pathname.match(/^\/api\/verification\/([^/]+)\/run$/);
  if (runMatch && req.method === 'POST') {
    if (context.readOnly) {
      sendJson(res, 409, { error: 'Dashboard server is running in read-only mode.' });
      return true;
    }

    const taskId = decodeURIComponent(runMatch[1]!);
    const state = await loadState(context.config.stateDir, cwd);
    const task = state.tasks.find((entry) => entry.id === taskId);
    if (!task) {
      sendJson(res, 404, { error: `Task ${taskId} not found.` });
      return true;
    }

    const taskFiles = await resolveTaskFiles(cwd, docsDir, taskId);
    const checks = await runChecks(Object.keys(AVAILABLE_CHECKS), cwd, { taskFiles });
    const summary: VerificationRunSummary = {
      lastRunAt: new Date().toISOString(),
      checks,
    };

    task.verification = summary;
    await saveState(state, context.config.stateDir, cwd);
    sendJson(res, 200, summary);
    return true;
  }

  const detailMatch = pathname.match(/^\/api\/verification\/([^/]+)$/);
  if (!detailMatch || req.method !== 'GET') {
    return false;
  }

  const taskId = decodeURIComponent(detailMatch[1]!);
  const state = await loadState(context.config.stateDir, cwd);
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) {
    sendJson(res, 404, { error: `Task ${taskId} not found.` });
    return true;
  }

  sendJson(res, 200, task.verification ?? emptySummary());
  return true;
}
