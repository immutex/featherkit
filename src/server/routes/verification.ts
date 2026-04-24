import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { z } from 'zod/v4';
import type { FeatherConfig, VerificationRunSummary } from '../../config/schema.js';
import { loadConfig, loadState, saveState } from '../../mcp/state-io.js';
import { AVAILABLE_CHECKS } from '../../verification/index.js';
import { resolveTaskFiles, runChecks } from '../../verification/runner.js';
import { readJsonBody, sendJson } from '../utils.js';

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

  // ── Auto-setup: detect project checks ──────────────────────────────────────
  if (pathname === '/api/verification/setup-detect' && req.method === 'GET') {
    const detected: Record<string, string> = {};
    try {
      const raw = await readFile(resolve(cwd, 'package.json'), 'utf8');
      const pkg = JSON.parse(raw) as Record<string, unknown>;
      const scripts = (typeof pkg.scripts === 'object' && pkg.scripts !== null ? pkg.scripts : {}) as Record<string, string>;
      const devDeps = (typeof pkg.devDependencies === 'object' && pkg.devDependencies !== null ? pkg.devDependencies : {}) as Record<string, string>;
      const hasBun = existsSync(resolve(cwd, 'bun.lock')) || existsSync(resolve(cwd, 'bun.lockb'));

      if (scripts['typecheck']) detected.typecheck = scripts['typecheck'];
      else if (devDeps['typescript']) detected.typecheck = 'tsc --noEmit';

      if (scripts['test']) detected.test = scripts['test'];
      else if (devDeps['vitest']) detected.test = hasBun ? 'bun test' : 'npx vitest run';

      if (scripts['lint']) detected.lint = scripts['lint'];
      else if (devDeps['eslint']) detected.lint = 'eslint src';

      if (scripts['format']) detected.format = scripts['format'];

      if (scripts['build']) detected.build = scripts['build'];
    } catch {
      // package.json not found — return empty
    }

    sendJson(res, 200, { checks: detected });
    return true;
  }

  // ── Auto-setup: save checks to config ──────────────────────────────────────
  if (pathname === '/api/verification/setup' && req.method === 'POST') {
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

    const parsed = z.object({ checks: z.record(z.string(), z.string()) }).safeParse(body);
    if (!parsed.success) {
      sendJson(res, 400, { error: 'Invalid setup payload.' });
      return true;
    }

    const config = await loadConfig(cwd);
    if (!config) {
      sendJson(res, 404, { error: 'featherkit/config.json not found.' });
      return true;
    }

    config.verification = { checks: parsed.data.checks };

    const configPath = resolve(cwd, 'featherkit', 'config.json');
    const tmpPath = configPath + '.tmp';
    const { writeFile, rename } = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(tmpPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    await rename(tmpPath, configPath);

    sendJson(res, 200, { ok: true, checks: parsed.data.checks });
    return true;
  }

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
