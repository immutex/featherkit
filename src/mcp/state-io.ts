// Shared state I/O — used by both CLI commands and MCP tools.
// No console.log here — this module is imported by the MCP server.

import { readFile, writeFile, rename, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { randomBytes } from 'crypto';
import { z } from 'zod/v4';
import { ProjectStateSchema, FeatherConfigSchema } from '../config/schema.js';
import type { ProjectState, FeatherConfig } from '../config/schema.js';

const DEFAULT_STATE_DIR = '.project-state';
const STATE_FILE = 'state.json';
const CONFIG_PATH = 'featherkit/config.json';

export function getStatePath(stateDir?: string, cwd = process.cwd()): string {
  return join(cwd, stateDir ?? DEFAULT_STATE_DIR, STATE_FILE);
}

export async function loadState(stateDir?: string, cwd = process.cwd()): Promise<ProjectState> {
  const statePath = getStatePath(stateDir, cwd);

  if (!existsSync(statePath)) {
    // Return a fresh empty state rather than erroring — init may not have run yet
    return {
      version: 1,
      currentTask: null,
      tasks: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  const raw = await readFile(statePath, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  const result = ProjectStateSchema.safeParse(parsed);

  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`Invalid state file at ${statePath}: ${issues}`);
  }

  return result.data;
}

export async function saveState(
  state: ProjectState,
  stateDir?: string,
  cwd = process.cwd()
): Promise<void> {
  const statePath = getStatePath(stateDir, cwd);
  const dir = dirname(statePath);

  // Ensure directory exists
  await mkdir(dir, { recursive: true });

  const content = JSON.stringify({ ...state, lastUpdated: new Date().toISOString() }, null, 2) + '\n';
  const tmp = join(dir, `.tmp-${randomBytes(6).toString('hex')}`);

  try {
    await writeFile(tmp, content, 'utf8');
    await rename(tmp, statePath);
  } catch (err) {
    try {
      const { unlink } = await import('fs/promises');
      await unlink(tmp).catch(() => undefined);
    } catch {
      // ignore cleanup error
    }
    throw err;
  }
}

export async function loadConfig(cwd = process.cwd()): Promise<FeatherConfig | null> {
  const configPath = join(cwd, CONFIG_PATH);
  if (!existsSync(configPath)) return null;

  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    const result = FeatherConfigSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function resolveDocsDir(config: FeatherConfig | null, cwd = process.cwd()): string {
  return join(cwd, config?.docsDir ?? 'project-docs');
}

export function resolveStateDir(config: FeatherConfig | null, cwd = process.cwd()): string {
  return join(cwd, config?.stateDir ?? DEFAULT_STATE_DIR);
}
